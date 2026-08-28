# Deploying the static model inference service

The Next.js web application is deployed to Vercel. The ML inference service
([`ml/service.py`](../ml/service.py)) is a separate Python/FastAPI process with
native dependencies (scikit-learn, XGBoost, CatBoost) that cannot run inside a
Vercel function. It is packaged as a container ([`ml/Dockerfile`](../ml/Dockerfile))
and deployed independently.

The web app reaches it over HTTPS via the `ML_SERVICE_URL` environment variable.
Until a model has been trained, registered, and **activated**, the service starts
normally and every prediction returns `MODEL_NOT_AVAILABLE` — deploying it is not
a prerequisite for the first web deploy.

## Configuration

| Variable | Where it comes from | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings | Same value as the web app |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings | Server-only secret; same value as the web app |
| `ML_SERVICE_TOKEN` | You generate it | A long random string. Set the **identical** value as `ML_SERVICE_TOKEN` in Vercel |
| `ARTIFACT_DIR` | Default `/tmp/artifacts` | Writable cache; ephemeral is fine, artifacts re-sync on every boot |
| `PORT` | Set automatically by Cloud Run / Render / Railway | Defaults to `8000` locally |

Generate a token:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

On the web side, add to Vercel (Project → Settings → Environment Variables):

```
ML_SERVICE_URL   = https://<your-deployed-service-url>
ML_SERVICE_TOKEN = <same token as above>
```

Then redeploy the web app.

## Local run (Docker Compose)

```bash
cp ml/.env.example ml/.env      # fill in the Supabase values + a token
docker compose up --build
curl http://127.0.0.1:8000/health
```

`/health` reports which model kinds are loaded and which are missing.

To test the full path locally, set `ML_SERVICE_URL=http://127.0.0.1:8000` and a
matching `ML_SERVICE_TOKEN` in the web app's `.env.local`.

## Option A — Google Cloud Run (recommended)

Scales to zero, ~2M requests/month free, pay-per-use above that. Expect a
10–15 s cold start with these dependencies.

```bash
cd ml
gcloud run deploy djihs-ml \
  --source . \
  --region asia-southeast1 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 60 \
  --allow-unauthenticated \
  --set-env-vars "NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co" \
  --set-env-vars "SUPABASE_SERVICE_ROLE_KEY=eyJ..." \
  --set-env-vars "ML_SERVICE_TOKEN=your-generated-token" \
  --set-env-vars "ARTIFACT_DIR=/tmp/artifacts"
```

`--allow-unauthenticated` is safe here: the endpoints are guarded by
`ML_SERVICE_TOKEN` (see [`ml/service.py`](../ml/service.py) `authorize`). For
secrets, prefer `--set-secrets` backed by Secret Manager over `--set-env-vars`.

`gcloud` prints a `Service URL` — use it as `ML_SERVICE_URL` in Vercel.

## Option B — Render (Docker, no CLI)

1. Push the repo to GitHub.
2. Render → **New** → **Web Service** → select the repo.
3. Settings:
   - **Root Directory:** `ml`
   - **Runtime:** Docker (Render auto-detects `ml/Dockerfile`)
   - **Health Check Path:** `/health`
   - **Instance Type:** Starter ($7/mo) for always-on, or Free (sleeps after 15 min idle).
4. Add the environment variables from the table above (`PORT` is provided by Render).
5. Deploy. The public URL becomes `ML_SERVICE_URL` in Vercel.

## Option C — Railway

1. Railway → **New Project** → **Deploy from GitHub repo**.
2. Service → **Settings** → set **Root Directory** to `/ml`. Railway detects the Dockerfile.
3. **Variables** tab: add the environment variables from the table above.
4. **Settings** → **Networking** → **Generate Domain** → use it as `ML_SERVICE_URL`.

## Option D — Azure Container Apps

Aligns with the manuscript's Azure framing; free monthly grant covers thesis traffic.

```bash
az containerapp up \
  --name djihs-ml \
  --resource-group djihs \
  --location southeastasia \
  --source ./ml \
  --ingress external \
  --target-port 8000 \
  --env-vars \
    NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co" \
    SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
    ML_SERVICE_TOKEN="your-generated-token" \
    ARTIFACT_DIR="/tmp/artifacts"
```

## Verifying the connection

After deploy, from any machine:

```bash
curl https://<service-url>/health
# {"service":"available","models":{},"missing":["pathway","neet"]}

# Token check (should be 401 without, 422 with a bad body):
curl -X POST https://<service-url>/predict/pathway
```

In the web app, open **Predictions** for a respondent. Before a model is active
you should see `MODEL_NOT_AVAILABLE`, not a connection error — that confirms
`ML_SERVICE_URL` and the token are wired correctly.

## Redeploy after activating a model

The service syncs active artifacts **only on startup**
([`sync_active_artifacts`](../ml/service.py)). After you activate a new registry
version, restart / redeploy the service so it downloads and loads the new bundle.
