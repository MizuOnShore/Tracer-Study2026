# DJIHS Web-based Tracer Analysis and Decision Support System

This repository implements the application described in the manuscript **“A Multi-Level Ensemble Learning Framework for Predicting K-12 Graduate Employability Pathways Using Tracer Study Data.”** In the revised import-only scope, authorized school users upload and validate tracer CSV/XLSX files, the system exposes aggregate analytical views, and production serves only explicitly activated static ML models. Public survey collection is disabled.

The repository contains **no tracer dataset, sample graduates, trained artifacts, model scores, default users, email addresses, or passwords**. Until real infrastructure and evidence exist, the UI reports states such as `DATA_NOT_AVAILABLE`, `POWER_BI_NOT_CONFIGURED`, and `MODEL_NOT_AVAILABLE`.

## Actual architecture

- Frontend/server: Next.js 16 App Router, React 19, strict TypeScript
- Authentication: Supabase Auth with server-side session refresh and role/status checks
- Structured storage: Supabase PostgreSQL with migrations, constraints, RPC transactions, RLS, and analytical views
- Object storage: private Supabase Storage buckets `raw-imports`, `prediction-inputs`, and `model-artifacts`
- Analytics: aggregate SQL views prepared as Power BI sources; accessible table fallback in Next.js
- ML: separately deployable Python FastAPI service (containerized, `ml/Dockerfile`); scikit-learn, XGBoost, and CatBoost
- Artifacts: immutable joblib bundles plus JSON metadata and SHA-256 verification

Supabase intentionally substitutes for the manuscript’s proposed Azure SQL and Azure Blob components. This architectural change must be acknowledged in the final manuscript.

## Local setup

1. Create a Supabase project.
2. Apply every file in [`supabase/migrations`](supabase/migrations) in filename order with `supabase db push` or the SQL editor.
3. Copy `.env.example` to `.env.local` and set the Supabase project URL, anon key, and server-only service-role key. Never expose the service-role key through a `NEXT_PUBLIC_` variable.
4. Create the first administrator with environment variables rather than committed credentials:

   ```powershell
   $env:BOOTSTRAP_ADMIN_EMAIL="your-admin-address"
   $env:BOOTSTRAP_ADMIN_PASSWORD="a-unique-password-of-at-least-12-characters"
   $env:BOOTSTRAP_ADMIN_FULL_NAME="Authorized Administrator"
   node scripts/bootstrap-admin.mjs
   ```

5. Install and start the web application:

   ```powershell
   npm install
   npm run dev
   ```

There is no public account registration. Administrators create and deactivate authorized accounts in `/admin`.

## Deployment

### Live deployment

| Component | Host | Address |
| --- | --- | --- |
| Web application (Next.js) | Vercel, auto-deploys from `main` | `https://tracer-study2026.vercel.app` |
| Inference service (FastAPI) | Render — Docker, [`ml/Dockerfile`](ml/Dockerfile) | `https://tracer-study2026.onrender.com` |
| Database, Auth, Storage | Supabase project `ylfxhiioplecaifurujd` | — |

### Web host

Deploy the Next.js application to Vercel or another Node-compatible host. Set these in the host environment rather than copying `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `ML_SERVICE_URL` and `ML_SERVICE_TOKEN` once the inference service is running
- `NEXT_PUBLIC_POWER_BI_REPORT_URL` when the real aggregate report is approved

### Inference service

The Python service is a separate deployment unit. Do not package `ml/service.py`, scikit-learn, XGBoost, CatBoost, or model artifacts into the Vercel application. It ships as a container ([`ml/Dockerfile`](ml/Dockerfile)) with a Render blueprint ([`render.yaml`](render.yaml)). See [`docs/ml-deployment.md`](docs/ml-deployment.md) for local Docker Compose plus Render, Cloud Run, Railway, and Azure Container Apps instructions, the required environment variables, and how the web app connects. `ML_SERVICE_TOKEN` must be identical in the inference host and the web host. The service downloads active artifacts only at startup — restart it after activating a new model version.

### After applying the migration

- Verify the private `raw-imports`, `prediction-inputs`, and `model-artifacts` bucket policies exist.
- Set the Auth Site URL and redirect allow-list to the production domain.
- Configure SMTP if password recovery will be enabled.
- Run `scripts/bootstrap-admin.mjs` once.

The public survey page redirects to the landing page and `POST /api/surveys` returns `410 SURVEY_COLLECTION_DISABLED`. Historical survey tables remain in the original migration for non-destructive compatibility but are not an active application data source.

The graduation-year range `2018`–`2025` is intentionally fixed to the approved tracer instrument and manuscript scope. Expanding it requires a versioned import/schema change and a documented manuscript amendment—not a date-based automatic bump.

## Data states and workflow

The intended progression is explicit:

1. `DATA_NOT_AVAILABLE` — no persisted tracer records.
2. `DATA_IMPORTED` — the original CSV/XLSX is in private storage and rows are staged.
3. `DATA_VALIDATED` — the preview has no blocking file or row errors.
4. `DATA_COMMITTED` — the database RPC atomically creates respondent records.
5. `MODEL_EVALUATED_NOT_ACTIVE` — offline training created held-out metrics and immutable artifacts.
6. `MODEL_ACTIVE` — a researcher/admin explicitly activated the evaluated registry version.

Committing an import never invokes the training pipeline. The exact committed private file becomes eligible for a separate, explicit offline training command.

Batch prediction is a separate inference-only workflow. A CSV/XLSX uploaded under `/predictions` is validated into a `prediction_run`, stored in the private `prediction-inputs` bucket, and never inserted into `respondent_records`. Only valid rows are sent through the server-side `/api/predictions/[runId]/execute` proxy to the Render service. The active pathway and NEET models run as a batch, the complete result is saved atomically, and Discussion & Insights reads only a selected completed run. The actual-data Dashboard remains unchanged.

After deploying a service version that includes the batch workflow, redeploy/restart Render so `POST /predict/batch` is available. `ML_SERVICE_TOKEN` is required on both hosts and is never returned to the browser.

## Import contract

Download the canonical CSV header from `/api/imports/template`. Required columns are:

`email`, `full_name`, `gender`, `age`, `graduation_year`, `strand`, `certification`, `current_status`, `subject_relevance`, `preparedness`, `challenges`, `support_needed`, `feedback`.

Branch columns are required when their status applies. The parser accepts CSV/XLSX up to 10 MB, normalizes approved categories, reports missing/extra columns and malformed rows, detects duplicates inside the file and against persisted fingerprints, and blocks commit while any row is invalid. Raw uploads are retained privately with their batch provenance.

## Static model development

Create a Python environment and install `ml/requirements.txt`. Use the batch ID displayed after commit (or in the dashboard import-batch table) so training downloads and hash-verifies the exact original private file:

```powershell
npm run train:import -- --batch-id <committed-batch-uuid> --version 2026-08-28.1
```

The first run without `--k` writes candidate-k SSE diagnostics and stops at `K_SELECTION_REQUIRED`. Review the elbow evidence and rerun with an intentional value:

```powershell
npm run train:import -- --batch-id <committed-batch-uuid> --version 2026-08-28.1 --k 4
```

The wrapper refuses uncommitted batches, downloads the source from `raw-imports`, verifies its bytes against `import_batches.sha256`, and deletes the temporary local copy after training. The pipeline then:

- removes duplicate/invalid rows and normalizes categories;
- holds the test set away from K-Means fitting;
- encodes/scales clustering inputs and records SSE for every candidate `k`;
- creates data-driven cluster IDs without assigning semantic names;
- uses a 70/15/15 development/evaluation design with fixed random state;
- tunes Random Forest, XGBoost, and CatBoost;
- builds Logistic Regression stacking features from five-fold out-of-fold `predict_proba` outputs;
- calculates accuracy, macro/weighted precision, recall, F1, per-class metrics, and labeled confusion matrices;
- trains a separate, stratified NEET Logistic Regression, selects its threshold on validation F2, and reports NEET recall;
- excludes current status and branch outcome fields from NEET predictors;
- stores preprocessing and estimators together so inference transformations match training.

The pipeline refuses to train with fewer than 100 usable records. It never invents missing samples or metrics.

Register an evaluated artifact manually:

```powershell
$env:PYTHONPATH="ml"
python ml/register_model.py ml/artifacts/pathway-2026-08-27.1.metadata.json
```

Use `--activate` only after reviewing the held-out evidence and approving cluster interpretations. Activation is transactional in PostgreSQL. The FastAPI service downloads only active private artifacts, verifies their SHA-256 metadata, and rejects a web request whose registry version differs from the loaded version. Restart the inference service after activation so it picks up the new artifacts.

## Verification

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Python checks require a Python installation:

```powershell
$env:PYTHONPATH="ml"
pytest ml/tests
python -m compileall ml
```

## Source traceability

See [`docs/manuscript-traceability.md`](docs/manuscript-traceability.md) for the requirement-to-code matrix and documented source discrepancies.
