# Deployment configuration

## Frontend API URL

The browser client uses `http://127.0.0.1:8000/api` when opened on localhost or
from a local file, preserving the local development setup. On a deployed
hostname it defaults to `/api`, which expects the frontend host or reverse
proxy to route `/api` to the FastAPI backend.

If the frontend and backend use different hosts, configure the full API URL
before loading `frontend/scripts/core/api.js` on each page:

```html
<script>window.API_BASE_URL = 'https://api.example.com/api';</script>
<script src="frontend/scripts/core/api.js"></script>
```

## Project layout

- `Backend/` contains the FastAPI service, database models, and backend tests.
- `frontend/home/`, `frontend/events/`, `frontend/people/`, `frontend/staff/`,
  `frontend/tickets/`, and `frontend/company/` group each feature's HTML, CSS,
  and JavaScript files.
- `frontend/scripts/core/` and `frontend/styles/core/` contain shared frontend
  code and styles.

The root `index.html` forwards visitors to the home page in `frontend/home/`.

## Backend environment

Set `EVENTHUB_ENV=production`, a private non-placeholder `EVENTHUB_SECRET_KEY`,
and `CORS_ALLOWED_ORIGINS` to the exact frontend origin(s), comma-separated and
without paths. For example:

```text
EVENTHUB_ENV=production
EVENTHUB_SECRET_KEY=<a unique, randomly generated secret>
CORS_ALLOWED_ORIGINS=https://events.example.com
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
