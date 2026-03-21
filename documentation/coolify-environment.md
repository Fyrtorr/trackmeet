# Coolify Deployment Environment Guide

This document describes our self-hosted Coolify deployment environment and the design decisions Claude agents should make when building new applications destined for it.

## Environment Overview

- **Platform**: Coolify (self-hosted PaaS) running on a single server
- **Build method**: Dockerfile-based builds (Coolify pulls from GitHub, builds the image, runs the container)
- **Domain routing**: Coolify handles HTTPS termination and reverse-proxy routing via Traefik
- **Domain pattern**: `<app-name>.beermoose.com`
- **GitHub org**: `Fyrtorr`

## How Deployment Works

1. You add a resource in Coolify pointed at a GitHub repo + branch
2. Coolify clones the repo, finds the `Dockerfile`, and builds it
3. The container runs and Coolify routes traffic from the configured domain to the container's exposed port
4. Coolify handles SSL certificates automatically

You do **not** write docker-compose files, CI/CD pipelines, or nginx proxy configs. Coolify owns all of that. Your only job is to provide a working `Dockerfile` at the repo root.

## Design Decisions for New Applications

### Always Provide

1. **`Dockerfile`** at the repo root — this is the only build mechanism Coolify uses
2. **`.dockerignore`** — at minimum exclude `node_modules`, `.git`, and any build output directories (e.g., `dist`, `build`, `.next`)
3. **`EXPOSE`** — declare the port your app listens on; you'll configure the same port in Coolify

### Bind Address

Containers run behind Coolify's reverse proxy. Your application **must bind to `0.0.0.0`**, not `127.0.0.1` or `localhost`. If the framework defaults to localhost (e.g., Vite dev server, some Express configs), override it explicitly:

```js
// Express
app.listen(PORT, '0.0.0.0');
```

```js
// Vite (if serving from Vite, though you shouldn't in production)
server: { host: '0.0.0.0' }
```

### Port Configuration

- Coolify maps external HTTPS traffic to whatever port you expose
- Use a single port; avoid multi-port setups unless necessary
- Convention: **80** for static/nginx containers, **3000** for Node.js APIs
- Make the port configurable via `ENV PORT=3000` when there's a runtime server

### Static SPAs (React, Vue, Vite, etc.)

Use a **multi-stage Dockerfile**: build stage compiles assets, production stage serves them with nginx.

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build    # or: npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

Key points:
- Install **all** dependencies (not `--omit=dev`) — build tools like vite, typescript, and bundlers are devDependencies
- If `npm run build` includes a `tsc` typecheck step that fails on non-blocking issues (unused vars, etc.), call the bundler directly: `npx vite build`
- The final image is tiny (just nginx + static files)
- No environment variables needed at runtime — everything is baked in at build time
- If your SPA uses client-side routing (React Router, etc.), add an nginx config that serves `index.html` for all routes

### Node.js APIs / Backend Services

Use a **single-stage Dockerfile** with production dependencies only:

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
```

Key points:
- Use `--omit=dev` since there's no build step (or add a build stage if using TypeScript)
- Only `COPY` the files you need — don't copy test files, docs, etc.
- Set `ENV` defaults for any config your app reads from environment variables

### Persistent Data

Coolify supports volume mounts configured in the UI. If your app needs persistent storage:

- **SQLite databases**: Store in a dedicated directory (e.g., `/app/data/`) and mount a Coolify volume there
- **File uploads**: Same approach — write to a known directory, mount a volume
- **Create directories at build time**: `RUN mkdir -p /app/data` so the path exists even before the volume is mounted
- Set `ENV DATA_DIR=/app/data` and use it in your app code so the path is configurable

If your app has **no persistent state** (SPAs, stateless APIs), you don't need any volumes.

### Environment Variables

- Define sensible defaults in the Dockerfile with `ENV`
- Coolify lets you set/override env vars in the UI — use this for secrets, API keys, and per-environment config
- **Never bake secrets into the Docker image**
- Common variables to make configurable: `PORT`, `DATABASE_URL` / `DATA_DIR`, `NODE_ENV`

### What Coolify Handles (Don't Do These Yourself)

- **HTTPS / SSL certificates** — Coolify + Traefik handle this automatically
- **Reverse proxy / domain routing** — configured in the Coolify UI
- **Container orchestration** — Coolify manages container lifecycle
- **Restart policies** — configured in Coolify
- **Build triggers** — can be set to auto-deploy on push via webhook

### Framework-Specific Notes

| Framework | Build output | Server | Port | Notes |
|-----------|-------------|--------|------|-------|
| Vite (React/Vue) | `dist/` | nginx | 80 | Multi-stage, `npx vite build` |
| Next.js | `.next/` + `standalone/` | Node.js | 3000 | Use `output: 'standalone'` in next.config, single-stage possible |
| Express / Fastify | N/A (runtime) | Node.js | 3000 | `--omit=dev`, bind `0.0.0.0` |
| Python (Flask/FastAPI) | N/A | gunicorn/uvicorn | 8000 | Use `python:3.x-slim`, install via `requirements.txt` |

## Gotchas We've Hit

1. **TypeScript type-check failures in Docker**: The `tsc -b` step in `npm run build` may fail on strict errors (unused variables, etc.) that don't affect the bundled output. Solution: call the bundler directly (`npx vite build`) instead of `npm run build`, or fix the type errors.

2. **devDependencies required for build**: For SPAs, `npm ci` must install devDependencies because the build toolchain (vite, typescript, etc.) lives there. Only use `--omit=dev` when there is no build step.

3. **Bind address**: If your app only binds to `127.0.0.1`, Coolify's proxy can't reach it. Always bind to `0.0.0.0`.

## Checklist for New Deployments

- [ ] `Dockerfile` at repo root
- [ ] `.dockerignore` excludes `node_modules`, `.git`, build output
- [ ] App binds to `0.0.0.0` (not localhost)
- [ ] Single `EXPOSE` port matching what the app listens on
- [ ] Builds successfully with `docker build .` locally
- [ ] In Coolify: repo URL, branch, build pack = Dockerfile, domain, port configured
- [ ] Volumes configured for any persistent data
- [ ] Environment variables set for secrets/config
