# Deployment configuration

## Frontend API URL

The browser client uses `http://127.0.0.1:8000/api` when opened on localhost or
from a local file, preserving the local development setup. On a deployed
hostname it uses the Render backend configured in `frontend/scripts/core/api.js`.
The deployed API URL is
`https://pap-eventhub-codigofinal-publico-a9jc.onrender.com/api`. If Render
assigns a different URL, update the production URL in
`frontend/scripts/core/api.js`.

To override the URL on a page, set `window.API_BASE_URL` before loading
`frontend/scripts/core/api.js`:

```html
<script>window.API_BASE_URL = 'https://your-render-service.onrender.com/api';</script>
<script src="frontend/scripts/core/api.js"></script>
```

## Deploying the backend to Render

In Render, create a Blueprint from this repository and use `render.yaml`. It
deploys the FastAPI app from `Backend/`, installs `Backend/requirements.txt`,
and starts Uvicorn. The Blueprint sets `EVENTHUB_ENV=production`, generates a
private `EVENTHUB_SECRET_KEY`, and allows the GitHub Pages origin
`https://angelo18ander-rgb.github.io`. The origin must not include the project
path (`/PAP_Eventhub_codigofinal_publico/`).

The service uses Render's free plan for testing. Its local SQLite database is
ephemeral, so accounts and events may be lost when the service restarts or is
redeployed. Do not use this free configuration for production data.

## Project layout

- `Backend/` contains the FastAPI service, database models, and backend tests.
- `frontend/home/`, `frontend/events/`, `frontend/people/`, `frontend/staff/`,
  `frontend/tickets/`, and `frontend/company/` group each feature's HTML, CSS,
  and JavaScript files.
- `frontend/scripts/core/` and `frontend/styles/core/` contain shared frontend
  code and styles.

The root `index.html` forwards visitors to the home page in `frontend/home/`.

## Backend environment

For manual deployments, set `EVENTHUB_ENV=production`, a private
non-placeholder `EVENTHUB_SECRET_KEY`, and `CORS_ALLOWED_ORIGINS` to the exact
frontend origin(s), comma-separated and without paths. For this GitHub Pages
site:

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
