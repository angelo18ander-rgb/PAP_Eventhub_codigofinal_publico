# Deployment configuration

## Frontend API URL

The browser client uses `http://127.0.0.1:8000/api` when opened on localhost or
from a local file, preserving the local development setup. On a deployed
hostname it uses the Fly.io backend configured in
`frontend/scripts/core/api.js`. The default API URL is
`https://pap-eventhub-codigofinal-publico.fly.dev/api`. If you change the app
name in `fly.toml`, update this URL to match.

To override the URL on a page, set `window.API_BASE_URL` before loading
`frontend/scripts/core/api.js`:

```html
<script>window.API_BASE_URL = 'https://your-fly-app.fly.dev/api';</script>
<script src="frontend/scripts/core/api.js"></script>
```

## Deploying the backend to Fly.io

The repository includes `fly.toml` and a root `Dockerfile` for deploying the
FastAPI app. The Fly app name defaults to
`pap-eventhub-codigofinal-publico`; app names are globally unique, so choose an
available name and update both `fly.toml` and the frontend API URL if needed.

Install and authenticate `flyctl`, then from the repository root:

```text
fly apps create pap-eventhub-codigofinal-publico
fly volumes create eventhub_data --region your-machine-region --size 1
fly secrets set EVENTHUB_SECRET_KEY=YOUR_GENERATED_SECRET
fly deploy
```

Replace `your-machine-region` with the app machine's Fly region and
`YOUR_GENERATED_SECRET` with a unique random secret before running the commands.
Create the volume in the same region as the app's machine. The app mounts it at
`/data` and stores SQLite at `/data/eventhub.db`, so data survives deployments
and machine restarts. This SQLite setup is intended for a single machine; do
not scale the app to multiple machines, since each Fly volume is local to one
machine and would result in separate databases. Keep
`CORS_ALLOWED_ORIGINS` set to the frontend origin
`https://angelo18ander-rgb.github.io`; it must not include the project path
(`/PAP_Eventhub_codigofinal_publico/`). `EVENTHUB_SECRET_KEY` is a Fly secret
and must never be committed to the repository.

## Project layout

- `Backend/` contains the FastAPI service, database models, and backend tests.
- `frontend/home/`, `frontend/events/`, `frontend/people/`, `frontend/staff/`,
  `frontend/tickets/`, and `frontend/company/` group each feature's HTML, CSS,
  and JavaScript files.
- `frontend/scripts/core/` and `frontend/styles/core/` contain shared frontend
  code and styles.

The root `index.html` forwards visitors to the home page in `frontend/home/`.

## Backend environment

For deployments outside the provided Fly.io configuration, set
`EVENTHUB_ENV=production`, a private non-placeholder `EVENTHUB_SECRET_KEY`,
and `CORS_ALLOWED_ORIGINS` to the exact frontend origin(s), comma-separated and
without paths. For this GitHub Pages site:

```text
EVENTHUB_ENV=production
EVENTHUB_SECRET_KEY=<a unique, randomly generated secret>
CORS_ALLOWED_ORIGINS=https://angelo18ander-rgb.github.io
```

Production startup fails when the JWT secret is absent or uses a development
placeholder, or when explicit CORS origins are not configured. Do not use the
local values from `Backend/.env.example` in production. Local development keeps
the built-in development key and localhost CORS origins.

Account registration and city changes use the Open-Meteo geocoding service
(GeoNames data) for city suggestions and server-side verification. The backend
must be able to make outbound HTTPS requests to `geocoding-api.open-meteo.com`.
If that service is unavailable, city search and submissions that change the
city fail safely and can be retried; an existing saved city does not block
updates to other profile fields.
