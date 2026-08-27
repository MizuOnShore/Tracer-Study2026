from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Callable

import numpy as np
import pandas as pd
from catboost import CatBoostClassifier
from sklearn.base import clone
from sklearn.cluster import KMeans
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import fbeta_score
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.ensemble import RandomForestClassifier
from xgboost import XGBClassifier

from tracer_ml import FEATURE_SCHEMA_VERSION
from tracer_ml.artifacts import save_bundle
from tracer_ml.evaluation import classification_metrics
from tracer_ml.schema import (
    NEET_NOMINAL_FEATURES,
    NEET_NUMERIC_FEATURES,
    PATHWAY_NOMINAL_FEATURES,
    PATHWAY_NUMERIC_FEATURES,
    construct_neet_target,
    normalize_frame,
)

RANDOM_STATE = 2025


def preprocessor(nominal: list[str], numeric: list[str], drop_first: bool = False) -> ColumnTransformer:
    return ColumnTransformer([
        ("nominal", Pipeline([
            ("missing", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False, drop="first" if drop_first else None)),
        ]), nominal),
        ("numeric", Pipeline([
            ("missing", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
        ]), numeric),
    ], verbose_feature_names_out=True)


def model_specs(class_count: int) -> dict[str, tuple[Callable[[], Any], dict[str, list[Any]]]]:
    xgb_objective = "binary:logistic" if class_count == 2 else "multi:softprob"
    xgb_metric = "logloss" if class_count == 2 else "mlogloss"
    return {
        "random_forest": (
            lambda: RandomForestClassifier(random_state=RANDOM_STATE, class_weight="balanced", n_jobs=-1),
            {"model__n_estimators": [250, 500], "model__max_depth": [None, 12], "model__min_samples_leaf": [1, 3]},
        ),
        "xgboost": (
            lambda: XGBClassifier(random_state=RANDOM_STATE, objective=xgb_objective, eval_metric=xgb_metric, n_jobs=-1),
            {"model__n_estimators": [200, 400], "model__max_depth": [3, 6], "model__learning_rate": [0.05, 0.1]},
        ),
        "catboost": (
            lambda: CatBoostClassifier(random_seed=RANDOM_STATE, verbose=False, allow_writing_files=False, auto_class_weights="Balanced"),
            {"model__iterations": [250, 500], "model__depth": [4, 7], "model__learning_rate": [0.05, 0.1]},
        ),
    }


def tune_base_models(X: pd.DataFrame, y: np.ndarray, nominal: list[str], numeric: list[str]) -> tuple[dict[str, Any], dict[str, Any]]:
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    selected: dict[str, Any] = {}
    tuning: dict[str, Any] = {}
    for name, (factory, grid) in model_specs(len(np.unique(y))).items():
        search = GridSearchCV(
            Pipeline([("preprocess", preprocessor(nominal, numeric)), ("model", factory())]),
            grid,
            scoring="f1_macro",
            cv=cv,
            n_jobs=-1,
            refit=True,
        )
        search.fit(X, y)
        selected[name] = clone(search.best_estimator_.named_steps["model"])
        tuning[name] = {"best_params": search.best_params_, "mean_cv_f1_macro": float(search.best_score_)}
    return selected, tuning


def aligned_probabilities(model: Any, X: np.ndarray, classes: np.ndarray) -> np.ndarray:
    probabilities = model.predict_proba(X)
    aligned = np.zeros((len(X), len(classes)), dtype=float)
    for source_index, label in enumerate(model.classes_):
        target_index = int(np.where(classes == label)[0][0])
        aligned[:, target_index] = probabilities[:, source_index]
    return aligned


def train_pathway(
    frame: pd.DataFrame,
    train_index: np.ndarray,
    validation_index: np.ndarray,
    test_index: np.ndarray,
    cluster_preprocessor: ColumnTransformer,
    kmeans: KMeans,
    cluster_labels: np.ndarray,
    output: Path,
    version: str,
    data_hash: str,
) -> dict[str, Any]:
    features = PATHWAY_NOMINAL_FEATURES + PATHWAY_NUMERIC_FEATURES
    X = frame[features]
    y = cluster_labels
    classes = np.sort(np.unique(y))
    if set(np.unique(y[train_index])) != set(classes):
        raise ValueError("Every pathway cluster must be represented in the 70% training split")

    selected, tuning = tune_base_models(X.iloc[train_index], y[train_index], PATHWAY_NOMINAL_FEATURES, PATHWAY_NUMERIC_FEATURES)
    oof = np.zeros((len(train_index), len(classes) * len(selected)), dtype=float)
    splitter = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    train_X = X.iloc[train_index].reset_index(drop=True)
    train_y = y[train_index]

    for fold_train, fold_holdout in splitter.split(train_X, train_y):
        fold_preprocessor = preprocessor(PATHWAY_NOMINAL_FEATURES, PATHWAY_NUMERIC_FEATURES)
        transformed_train = fold_preprocessor.fit_transform(train_X.iloc[fold_train])
        transformed_holdout = fold_preprocessor.transform(train_X.iloc[fold_holdout])
        for model_index, (name, template) in enumerate(selected.items()):
            model = clone(template).fit(transformed_train, train_y[fold_train])
            start = model_index * len(classes)
            oof[fold_holdout, start:start + len(classes)] = aligned_probabilities(model, transformed_holdout, classes)

    meta = LogisticRegression(max_iter=3000, class_weight="balanced", random_state=RANDOM_STATE)
    meta.fit(oof, train_y)
    final_preprocessor = preprocessor(PATHWAY_NOMINAL_FEATURES, PATHWAY_NUMERIC_FEATURES)
    transformed_train = final_preprocessor.fit_transform(X.iloc[train_index])
    final_models = {name: clone(template).fit(transformed_train, train_y) for name, template in selected.items()}

    def stacked_probabilities(index: np.ndarray) -> np.ndarray:
        transformed = final_preprocessor.transform(X.iloc[index])
        meta_features = np.hstack([aligned_probabilities(model, transformed, classes) for model in final_models.values()])
        return meta.predict_proba(meta_features)

    evaluations: dict[str, Any] = {}
    for split_name, index in (("validation", validation_index), ("test", test_index)):
        probabilities = stacked_probabilities(index)
        predictions = meta.classes_[np.argmax(probabilities, axis=1)]
        evaluations[split_name] = classification_metrics(y[index], predictions, classes.tolist())

    profiles = []
    for cluster_id in classes:
        subset = frame.loc[y == cluster_id]
        profiles.append({
            "cluster_id": int(cluster_id),
            "interpreted_label": None,
            "record_count": len(subset),
            "dominant_statuses": subset["current_status"].value_counts(normalize=True).round(4).to_dict(),
            "dominant_strands": subset["strand"].value_counts(normalize=True).head(5).round(4).to_dict(),
            "mean_subject_relevance": float(subset["subject_relevance"].mean()),
            "mean_preparedness": float(subset["preparedness"].mean()),
        })

    bundle = {
        "kind": "pathway",
        "version": version,
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "features": features,
        "preprocessor": final_preprocessor,
        "base_models": final_models,
        "meta_learner": meta,
        "classes": classes,
        "cluster_preprocessor": cluster_preprocessor,
        "kmeans": kmeans,
    }
    metadata = {
        "kind": "pathway",
        "version": version,
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "training_data_hash": data_hash,
        "training_record_count": len(train_index),
        "split_counts": {"train": len(train_index), "validation": len(validation_index), "test": len(test_index)},
        "split_strategy": "15% test held out before clustering; development cluster labels stratified into 70% train and 15% validation",
        "random_state": RANDOM_STATE,
        "k": int(len(classes)),
        "base_model_order": list(final_models),
        "meta_feature_shape": [len(train_index), int(oof.shape[1])],
        "meta_feature_source": "5-fold out-of-fold predict_proba on training rows",
        "tuning": tuning,
        "evaluation": evaluations,
        "cluster_profiles": profiles,
    }
    return {**save_bundle(bundle, metadata, output, f"pathway-{version}"), "metadata_content": metadata}


def train_neet(frame: pd.DataFrame, train_index: np.ndarray, validation_index: np.ndarray, test_index: np.ndarray, output: Path, version: str, data_hash: str) -> dict[str, Any]:
    features = NEET_NOMINAL_FEATURES + NEET_NUMERIC_FEATURES
    X = frame[features]
    y = construct_neet_target(frame).to_numpy()
    if len(np.unique(y[train_index])) != 2:
        raise ValueError("Both NEET and non-NEET classes must appear in the training split")
    pipeline = Pipeline([
        ("preprocess", preprocessor(NEET_NOMINAL_FEATURES, NEET_NUMERIC_FEATURES, drop_first=True)),
        ("model", LogisticRegression(max_iter=3000, class_weight="balanced", random_state=RANDOM_STATE)),
    ])
    search = GridSearchCV(pipeline, {"model__C": [0.01, 0.1, 1.0, 10.0]}, scoring="recall", cv=StratifiedKFold(5, shuffle=True, random_state=RANDOM_STATE), n_jobs=-1, refit=True)
    search.fit(X.iloc[train_index], y[train_index])
    model = search.best_estimator_
    validation_probabilities = model.predict_proba(X.iloc[validation_index])[:, 1]
    thresholds = np.linspace(0.10, 0.90, 81)
    threshold = float(max(thresholds, key=lambda value: fbeta_score(y[validation_index], validation_probabilities >= value, beta=2, zero_division=0)))
    evaluations: dict[str, Any] = {}
    for split_name, index in (("validation", validation_index), ("test", test_index)):
        probabilities = model.predict_proba(X.iloc[index])[:, 1]
        predictions = (probabilities >= threshold).astype(int)
        evaluations[split_name] = classification_metrics(y[index], predictions, [0, 1])
        evaluations[split_name]["threshold"] = threshold
        evaluations[split_name]["neet_recall"] = evaluations[split_name]["per_class"]["1"]["recall"]

    feature_names = model.named_steps["preprocess"].get_feature_names_out()
    encoder = model.named_steps["preprocess"].named_transformers_["nominal"].named_steps["onehot"]
    reference_categories = {
        feature: str(categories[0]) for feature, categories in zip(NEET_NOMINAL_FEATURES, encoder.categories_, strict=True)
    }
    coefficients = model.named_steps["model"].coef_[0]
    associations = sorted([
        {"encoded_feature": str(name), "coefficient": float(coefficient), "direction": "higher" if coefficient > 0 else "lower", "language": "associated with predicted NEET likelihood; not causal"}
        for name, coefficient in zip(feature_names, coefficients, strict=True)
    ], key=lambda item: abs(item["coefficient"]), reverse=True)
    bundle = {"kind": "neet", "version": version, "feature_schema_version": FEATURE_SCHEMA_VERSION, "features": features, "model": model, "threshold": threshold, "associations": associations}
    metadata = {
        "kind": "neet", "version": version, "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "training_data_hash": data_hash, "training_record_count": len(train_index),
        "split_counts": {"train": len(train_index), "validation": len(validation_index), "test": len(test_index)},
        "random_state": RANDOM_STATE, "best_params": search.best_params_, "mean_cv_neet_recall": float(search.best_score_),
        "threshold_selection": "validation-set maximum F2 to emphasize NEET recall", "threshold": threshold,
        "evaluation": evaluations, "coefficient_associations": associations,
        "categorical_reference_groups": reference_categories,
        "excluded_as_target_leakage": ["current_status", "higher_education_course", "employer_name", "job_title", "business_nature", "training_center", "training_title", "actively_seeking"],
    }
    return {**save_bundle(bundle, metadata, output, f"neet-{version}"), "metadata_content": metadata}


def main() -> None:
    parser = argparse.ArgumentParser(description="Train static DJIHS pathway and NEET models from validated tracer data.")
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--output", type=Path, default=Path("artifacts"))
    parser.add_argument("--version", required=True, help="Immutable version, for example 2026-08-27.1")
    parser.add_argument("--k", type=int, help="Researcher-selected k after reviewing elbow diagnostics")
    parser.add_argument("--min-k", type=int, default=2)
    parser.add_argument("--max-k", type=int, default=8)
    args = parser.parse_args()

    raw_bytes = args.dataset.read_bytes()
    raw = pd.read_csv(args.dataset) if args.dataset.suffix.lower() == ".csv" else pd.read_excel(args.dataset)
    frame, cleaning = normalize_frame(raw)
    if len(frame) < 100:
        raise ValueError("At least 100 usable records are required before this pipeline will train")
    data_hash = hashlib.sha256(raw_bytes).hexdigest()

    all_indices = np.arange(len(frame))
    development_index, test_index = train_test_split(
        all_indices, test_size=0.15, random_state=RANDOM_STATE, stratify=frame["current_status"]
    )
    cluster_features = PATHWAY_NOMINAL_FEATURES + PATHWAY_NUMERIC_FEATURES
    cluster_transformer = preprocessor(PATHWAY_NOMINAL_FEATURES, PATHWAY_NUMERIC_FEATURES)
    development_matrix = cluster_transformer.fit_transform(frame.iloc[development_index][cluster_features])
    candidate_ks = range(args.min_k, min(args.max_k, len(development_index) - 1) + 1)
    sse = {str(k): float(KMeans(n_clusters=k, random_state=RANDOM_STATE, n_init=20).fit(development_matrix).inertia_) for k in candidate_ks}
    args.output.mkdir(parents=True, exist_ok=True)
    diagnostic_path = args.output / f"elbow-{args.version}.json"
    diagnostic_path.write_text(json.dumps({"candidate_k_sse": sse, "development_records": len(development_index), "random_state": RANDOM_STATE}, indent=2), encoding="utf-8")
    if args.k is None:
        raise SystemExit(f"K_SELECTION_REQUIRED: review {diagnostic_path} and rerun with --k")
    if str(args.k) not in sse:
        raise ValueError(f"Selected k must be one of {list(sse)}")

    kmeans = KMeans(n_clusters=args.k, random_state=RANDOM_STATE, n_init=20).fit(development_matrix)
    cluster_labels = kmeans.predict(cluster_transformer.transform(frame[cluster_features]))
    train_index, validation_index = train_test_split(
        development_index, test_size=(0.15 / 0.85), random_state=RANDOM_STATE,
        stratify=cluster_labels[development_index],
    )
    # Test was isolated before any clustering fit. Its discovered-cluster balance
    # is reported, not manipulated after the model has seen it.
    split_distribution = {
        name: pd.Series(cluster_labels[index]).value_counts(normalize=True).sort_index().round(4).to_dict()
        for name, index in (("train", train_index), ("validation", validation_index), ("test", test_index))
    }

    pathway = train_pathway(frame, train_index, validation_index, test_index, cluster_transformer, kmeans, cluster_labels, args.output, args.version, data_hash)
    neet_target = construct_neet_target(frame).to_numpy()
    neet_development, neet_test = train_test_split(
        all_indices, test_size=0.15, random_state=RANDOM_STATE, stratify=neet_target
    )
    neet_train, neet_validation = train_test_split(
        neet_development, test_size=(0.15 / 0.85), random_state=RANDOM_STATE,
        stratify=neet_target[neet_development],
    )
    neet = train_neet(frame, neet_train, neet_validation, neet_test, args.output, args.version, data_hash)
    run_manifest = {
        "state": "MODEL_EVALUATED_NOT_ACTIVE",
        "version": args.version,
        "data_hash": data_hash,
        "cleaning": cleaning,
        "candidate_k_sse": sse,
        "selected_k": args.k,
        "cluster_split_distribution": split_distribution,
        "neet_split_distribution": {
            name: pd.Series(neet_target[index]).value_counts(normalize=True).sort_index().round(4).to_dict()
            for name, index in (("train", neet_train), ("validation", neet_validation), ("test", neet_test))
        },
        "pathway": {key: value for key, value in pathway.items() if key != "metadata_content"},
        "neet": {key: value for key, value in neet.items() if key != "metadata_content"},
        "activation_instruction": "Upload verified artifacts, register metrics and cluster profiles, then explicitly activate one version per model kind. Training does not activate models.",
    }
    (args.output / f"training-run-{args.version}.json").write_text(json.dumps(run_manifest, indent=2), encoding="utf-8")
    print(json.dumps(run_manifest, indent=2))


if __name__ == "__main__":
    main()
