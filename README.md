# DJIHS Web-based Tracer Analysis and Decision Support System

This repository implements the application described in the manuscript **“A Multi-Level Ensemble Learning Framework for Predicting K-12 Graduate Employability Pathways Using Tracer Study Data.”** It collects and validates alumni tracer responses, stages imported tracer files, exposes aggregate analytical views, and serves only explicitly activated static ML models.

The repository contains **no tracer dataset, sample graduates, trained artifacts, model scores, default users, email addresses, or passwords**. Until real infrastructure and evidence exist, the UI reports states such as `DATA_NOT_AVAILABLE`, `POWER_BI_NOT_CONFIGURED`, and `MODEL_NOT_AVAILABLE`.

## Actual architecture

- Frontend/server: Next.js 16 App Router, React 19, strict TypeScript
- Authentication: Supabase Auth with server-side session refresh and role/status checks
- Structured storage: Supabase PostgreSQL with migrations, constraints, RPC transactions, RLS, and analytical views
- Object storage: private Supabase Storage buckets `raw-imports` and `model-artifacts`
- Analytics: aggregate SQL views prepared as Power BI sources; accessible table fallback in Next.js
- ML: separately deployable Python FastAPI service; scikit-learn, XGBoost, and CatBoost
- Artifacts: immutable joblib bundles plus JSON metadata and SHA-256 verification

Supabase intentionally substitutes for the manuscript’s proposed Azure SQL and Azure Blob components. This architectural change must be acknowledged in the final manuscript.

## Local setup

1. Create a Supabase project.
2. Apply [`supabase/migrations/202608270001_initial_schema.sql`](supabase/migrations/202608270001_initial_schema.sql) with the Supabase CLI or SQL editor.
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

## Production deployment

Deploy the Next.js application to Vercel or another Node-compatible host. Configure these values in the host environment rather than copying `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `SURVEY_RATE_LIMIT_SECRET` (server-only, at least 32 random bytes)
- `ML_SERVICE_URL` and `ML_SERVICE_TOKEN` when prediction service is available
- `NEXT_PUBLIC_POWER_BI_REPORT_URL` when the real aggregate report is approved

The Python service is a separate deployment unit. Do not package `ml/service.py`, scikit-learn, XGBoost, CatBoost, and model artifacts into the Vercel Next.js application. Deploy it to a persistent Python service such as Render, Railway, Fly.io, Azure App Service, or a managed VM, restrict its network/token access, and then set the two `ML_SERVICE_*` values in the web host.

After the Supabase migration, verify private bucket policies, set the Auth Site URL/redirect allow-list to the production domain, configure SMTP if password recovery will be enabled, and run `scripts/bootstrap-admin.mjs` once. The public survey endpoint uses a server-only service-role call and a database-backed HMAC rate limit (20 accepted attempts per 10-minute network window); the public anon key cannot invoke the submission RPC directly. Infrastructure-level WAF throttling remains recommended as defense in depth.

The graduation-year range `2018`–`2025` is intentionally fixed to the approved questionnaire and manuscript scope. Expanding it requires a versioned survey/schema change and a documented manuscript amendment—not a date-based automatic bump.

## Data states and workflow

The intended progression is explicit:

1. `DATA_NOT_AVAILABLE` — no persisted tracer records.
2. `DATA_IMPORTED` — the original CSV/XLSX is in private storage and rows are staged.
3. `DATA_VALIDATED` — the preview has no blocking file or row errors.
4. `DATA_COMMITTED` — the database RPC atomically creates respondent records.
5. `MODEL_EVALUATED_NOT_ACTIVE` — offline training created held-out metrics and immutable artifacts.
6. `MODEL_ACTIVE` — a researcher/admin explicitly activated the evaluated registry version.

Adding survey or import records never invokes the training pipeline.

## Import contract

Download the canonical CSV header from `/api/imports/template`. Required columns are:

`email`, `full_name`, `gender`, `age`, `graduation_year`, `strand`, `certification`, `current_status`, `subject_relevance`, `preparedness`, `challenges`, `support_needed`, `feedback`.

Branch columns are required when their status applies. The parser accepts CSV/XLSX up to 10 MB, normalizes approved categories, reports missing/extra columns and malformed rows, detects duplicates inside the file and against persisted fingerprints, and blocks commit while any row is invalid. Raw uploads are retained privately with their batch provenance.

## Static model development

Create a Python environment and install `ml/requirements.txt`. Then run:

```powershell
$env:PYTHONPATH="ml"
python ml/train.py validated-tracer.csv --version 2026-08-27.1 --output ml/artifacts
```

The first run without `--k` writes candidate-k SSE diagnostics and exits with `K_SELECTION_REQUIRED`. Review the elbow evidence and rerun with an intentional value, for example `--k 4`. The pipeline then:

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

Use `--activate` only after reviewing the held-out evidence and approving cluster interpretations. Activation is transactional in PostgreSQL. The FastAPI service downloads only active private artifacts, verifies their SHA-256 metadata, and rejects a web request whose registry version differs from the loaded version.

## Deployment

The web application deploys to Vercel. The FastAPI inference service is containerized ([`ml/Dockerfile`](ml/Dockerfile)) and deployed separately — it cannot run inside a Vercel function. See [`docs/ml-deployment.md`](docs/ml-deployment.md) for local Docker Compose and hosted options (Cloud Run, Render, Railway, Azure Container Apps), the required environment variables, and how the web app connects through `ML_SERVICE_URL` / `ML_SERVICE_TOKEN`.

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
