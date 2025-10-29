# Multishowcase Frontend (Express + EJS)

Express (ESM) + EJS app with Tailwind CDN and feature routes (home, explore, comment, profile, groups). File upload and AWS Cognito login are available when environment variables are configured.

## Prerequisites

- Node.js 18+ (tested with Node 22)
- npm

## Setup

1) Install dependencies

```sh
npm install
```

2) Copy environment template and fill values

```sh
cp .env.example .env
# Open .env and set values
```

At minimum for local pages without auth, you can leave AWS/DB blank. To use login or DB, set the variables accordingly.

3) Run the server

```sh
npm start
```

The app will start at http://localhost:3000

## Key files

- `server.js` — root entry that imports `src/server.js`
- `src/server.js` — express app, views, static, and routes wiring
- `src/views/` — EJS pages and components
- `src/routes/` — route modules
- `src/controllers/` — request handlers
- `src/services/` — data/services (e.g., groups persistence, Cognito client)
- `src/data/` — mock/persisted JSON data

## Environment variables

See `.env.example` for the full list. Common ones:

- AWS_REGION
- AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, (optional) AWS_SESSION_TOKEN
- COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, COGNITO_CLIENT_SECRET, COGNITO_DOMAIN
- PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT

If AWS variables are not provided, AWS-dependent endpoints (signup/login) won’t work. Non-auth pages (e.g., `/groups`) can still run.
