# Manuscript and questionnaire traceability

Authoritative sources reviewed in full:

- `2025CS012_Manuscript.docx`
- `SHS GRAD SURVEY - Google Forms.pdf` (8 pages, 26 questions)

Repository status below means implemented in source, not deployed. Live Supabase, Power BI, real dataset, trained artifacts, held-out scores, and end-to-end persistence remain **CANNOT VERIFY** until project credentials and research data are supplied.

**Revised source policy:** the owner requested an import-only system on 2026-08-28. Public survey collection is disabled and all active analytical/training data must originate from committed CSV/XLSX batches. This is a **THESIS–IMPLEMENTATION MISMATCH** until the manuscript removes or revises the Alumni actor and Survey Collection Module.

| ID | Requirement | Expected | Repository implementation | Evidence | Status | Severity if absent | Remaining action |
|---|---|---|---|---|---|---|---|
| AUTH-01 | Secure login/logout | Supabase session, no client-only trust | SSR client, session proxy, logout route | `proxy.ts`; `lib/auth.ts`; `app/login/page.tsx`; `app/api/auth/logout/route.ts` | Implemented | Critical | Configure Supabase and test deployed cookies |
| AUTH-02 | Role authorization | Admin/user checks on server and DB | Page guards, API checks, RLS helpers | `lib/auth.ts`; migration `current_app_role`, `is_admin`, RLS policies | Implemented | Critical | Run RLS integration tests against project |
| AUTH-03 | Public alumni access | Revised scope has no public alumni data entry | Survey link/form removed; legacy page redirects; API returns HTTP 410 | landing/header; `app/survey/page.tsx`; survey API | Removed by revised scope | Critical | Amend manuscript actors and use cases |
| USER-01 | Admin manages accounts | View/add/edit/deactivate | Admin API uses Supabase Auth Admin plus profile/audit compensation | `app/admin/page.tsx`; `app/api/admin/users/route.ts` | Implemented | High | Configure first admin and test lifecycle |
| SURV-01 | Actual survey fields | Original thesis requires questions 1–26 | Public form removed; import contract is the only active input | survey redirect/API; import parser/template | Removed by revised scope | High | Amend manuscript methodology and system modules |
| SURV-02 | Consent | Required only for direct public collection | No direct public collection occurs in the revised system | survey API returns HTTP 410 | Not applicable after scope change | Critical | Document consent/provenance of school-supplied CSV |
| SURV-03 | Branching | Required only for interactive questionnaire | Branch columns are validated conditionally during import | `lib/import-parser.ts` | Replaced by import validation | High | Update use-case and validation descriptions |
| SURV-04 | Survey persistence | Original thesis requires public response storage | Runtime submission is disabled; historical tables remain non-destructively | survey redirect/API; original migration | Removed by revised scope | Critical | Amend manuscript before defense |
| SURV-05 | Duplicate prevention | Imported graduates must remain unique | File/database fingerprints block duplicate imports | import parser/API/database constraint | Implemented for imports | High | Define correction policy with DJIHS |
| IMP-01 | CSV/XLSX controls | Type and 10 MB size limits | Extension/MIME/size checks | `app/api/imports/route.ts`; `lib/import-parser.ts` | Implemented | High | Test browser MIME variants |
| IMP-02 | Column validation | Required/missing/extra columns | Canonical template and coded issues | `lib/import-parser.ts`; template route | Implemented | High | Approve import data dictionary |
| IMP-03 | Row validation | Null, type, range, category, branch checks | Normalization and row/file issues | `lib/import-parser.ts` | Implemented | High | Add real malformed fixtures when available |
| IMP-04 | Duplicate handling | Within-file and database checks | Fingerprint map plus persisted query | parser and import API | Implemented | High | Load test large files |
| IMP-05 | Provenance | Raw private file + batch + row number | Storage path/hash/batch/staged row/source row | migration; import API | Implemented | High | Verify bucket policies live |
| IMP-06 | Transactional commit | Invalid/partial batch cannot commit | PostgreSQL `commit_import_batch` transaction | migration RPC; commit route | Implemented | Critical | Integration-test rollback |
| IMP-07 | Training-source provenance | Train the exact committed import | Offline wrapper downloads private batch file, verifies SHA-256, then calls static pipeline | `scripts/train-import-batch.mjs`; `ml/train.py` | Implemented | Critical | Run against the approved real batch |
| REC-01 | Record search | Name/email/year/strand/status | Server query with RLS | `app/respondents/page.tsx` | Implemented | High | Add pagination beyond 100 results |
| REC-02 | Record management | View and correct persisted records | Detail/edit API, recalculated fingerprint, audit | respondent detail/editor/API | Implemented | High | Agree deletion/retention policy |
| DASH-01 | Real dashboard totals | Committed imports only | Dedicated `analytics_import_*` views filter `source = 'import'` | dashboard; import-dashboard migration | Implemented | Critical | Reconcile with real imported batch |
| DASH-02 | Filtered analytics | Filters affect source query | SQL-view query filters | analytics page/API | Implemented | High | Verify Power BI filter design |
| PBI-01 | Power BI primary analytics | Aggregate-source connection | Aggregate views and configurable secure embed; no fake React chart | analytics page; two analytical views | Partial | High | Build/publish actual Power BI report |
| INS-01 | Evidence-based discussion | Distinguish finding/prediction/recommendation | Labeled sections from aggregates/active profiles | insights page | Implemented | High | Review wording after real data |
| ML-01 | Cleaning/preparation | Dedupe, normalize, validate, impute/encode/scale | Shared schema; train-only model preprocessors | `ml/tracer_ml/schema.py`; `ml/train.py` | Implemented | Critical | Execute on real validated export |
| ML-02 | K-Means | Scaled candidate-k clustering | Development-only fitted transformer/KMeans | `ml/train.py` | Implemented | Critical | Supply real data |
| ML-03 | Elbow/SSE | Calculate candidate k; intentional choice | JSON SSE diagnostic; no `--k` means hard stop | `ml/train.py` | Implemented | High | Researcher documents selected k |
| ML-04 | Data-driven pathway labels | Cluster IDs before interpretation | No semantic hardcoding; stored profile label initially null | training metadata; `cluster_profiles` | Implemented | Critical | Researchers approve cluster labels |
| ML-05 | 70/15/15 and reproducibility | Held-out test; fixed seed; stratification | 2025 seed; test isolated pre-cluster; development stratified by clusters; NEET fully stratified | `ml/train.py` | Implemented with documented design nuance | Critical | Report split distributions in thesis |
| ML-06 | RF/XGB/CatBoost | Genuine tuned probability models | GridSearchCV and `predict_proba` | `model_specs`, `tune_base_models`, `aligned_probabilities` | Implemented | Critical | Run and retain tuning evidence |
| ML-07 | LR stacking | All class probabilities from three learners | Dynamic `3 × k` meta matrix | `train_pathway` | Implemented | Critical | Execute on real data |
| ML-08 | Stacking leakage prevention | OOF training meta-features | Five-fold preprocessing/model fit per training fold | `train_pathway` OOF loop | Implemented | Critical | Audit generated run metadata |
| ML-09 | Pathway evaluation | Held-out metrics and labeled matrix | Validation/test metrics, macro/weighted/per-class | `classification_metrics`; pathway metadata | Implemented | High | Values unavailable until training |
| NEET-01 | Correct target | Only direct not-in-E/E/T state is positive | Explicit status mapping; entrepreneurship/study/training negative | `construct_neet_target` and test | Implemented | Critical | Verify source-category coding |
| NEET-02 | Separate Logistic Regression | Binary LR, no K-Means target | Independent pipeline and model bundle | `train_neet` | Implemented | Critical | Execute on real data |
| NEET-03 | No outcome leakage | Exclude status/branch outcomes | Explicit feature allowlist and excluded metadata | schema/train files | Implemented | Critical | Panel review predictor rationale |
| NEET-04 | Risk evaluation | Recall, false negatives, imbalance, threshold | Balanced LR, validation F2 threshold, class matrix/recall | `train_neet` | Implemented | High | Report actual held-out values |
| NEET-05 | Factor interpretation | Encoded names, reference groups, association wording | Drop-first categories, coefficients/contributions, non-causal text | train/service/UI | Implemented | High | Review feature scaling explanation |
| MOD-01 | Static artifacts | No automatic retraining | Commit exposes batch ID; explicit offline wrapper verifies exact import and calls `ml/train.py` | import workflow; `scripts/train-import-batch.mjs` | Implemented | Critical | Preserve manual k review and activation |
| MOD-02 | Preprocessing parity | Inference uses fitted training transformer | Preprocessor bundled with every model | artifact bundle/service | Implemented | Critical | Verify checksum/version in deployment |
| MOD-03 | Private model storage | Upload/download and registry | Supabase Storage upload, active download, SHA-256 check | `register_model.py`; `service.py`; migration | Implemented | High | Configure private bucket/project |
| PRED-01 | Pathway end-to-end | Model → probabilities → meta → persistence → UI | Fail-closed API/service/result table/UI | prediction route/service/workflow | Implemented | Critical | Requires real active artifact to verify |
| PRED-02 | NEET end-to-end | LR probability/threshold/factors/persistence/UI | Fail-closed equivalent | prediction route/service/workflow | Implemented | Critical | Requires real active artifact to verify |
| AUD-01 | Activity history | Material actions retained | Audit table, RLS, event writes, admin page | migration/routes/audit page | Implemented | Medium | Establish retention period |
| SEC-01 | Secrets | Server-only service key/token | `.env.example`, server modules only | config/admin/prediction code | Implemented | Critical | Rotate any previously exposed secrets |
| SEC-02 | PII minimization | Aggregate public/reporting access | No public reads; aggregate views exclude PII | RLS/views | Implemented | Critical | Privacy impact assessment |
| SEC-03 | Public write surface | Revised system accepts no public data writes | Survey page redirects and API returns HTTP 410 | survey page/API | Implemented | High | Confirm no alternate public insertion path |
| QUAL-01 | Strict build quality | No ignored TS; lint/tests/build | Build bypass removed; scripts and tests present | `next.config.mjs`; `package.json`; `tests` | Implemented | High | See actual CI/build results |

## Source discrepancies requiring manuscript decisions

1. **THESIS–IMPLEMENTATION MISMATCH:** The original manuscript requires an Alumni actor and Survey Collection Module. The revised application is import-only and disables public survey collection. Update the scope, actors, use cases, DFDs, methodology, privacy discussion, and functional requirements before defense.
2. **THESIS–IMPLEMENTATION MISMATCH:** The manuscript architecture diagrams name Azure SQL and Azure Blob. The approved rebuild uses Supabase PostgreSQL/Auth/Storage. Update the manuscript architecture, ERD/DFD labels, deployment discussion, and technology rationale.
3. The supplied final Google Form’s displayed research title differs from the manuscript/system title. The public form is no longer deployed; approve one final title across all materials.
4. The final questionnaire spells the strand `HUMMS`. The implementation preserves that exact import category instead of silently changing it to conventional `HUMSS`. Researchers must decide whether this is an approved value or a typo.
5. The PDF does not visibly direct a “No” consent response to an ending section. This instrument discrepancy remains relevant to the manuscript even though the public form is no longer deployed.
6. The manuscript’s preliminary instrument synthesis mentions civil/contact, industry, salary, time-to-first-job, and business scale/income/duration fields that do not appear in the final supplied 26-question form. They were not silently added to the import contract.
7. The manuscript’s illustrative stacking table visually resembles one probability per learner, while the prose and implementation require every class probability from every base learner (`3 × k`).
8. The manuscript contains an accuracy-formula wording typo (false positive stated twice; the second term should be false negative). The implementation uses scikit-learn’s correct definitions.
9. NEET predictor examples in the manuscript include indicators not collected by the final form. The implementation does not create phantom variables.

## Verification boundary

The following remain `CANNOT VERIFY` without external assets: live RLS behavior, actual imported dataset quality, Power BI reconciliation, selected `k`, learned cluster profiles/names, all evaluation values, model checksum download in deployment, and complete end-to-end predictions. The system intentionally refuses to fabricate substitutes for them.
