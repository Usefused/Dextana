# Dextana website

A standalone, server-rendered Remix 2 / React / TypeScript website for Dextana. It has its own dependencies and Docker image and does not import or start the Electron app, agent, Ollama, or a database.

## Develop

Use Node 22 or newer (the container uses Node 24):

```sh
cd website
npm ci
npm run dev
```

Open http://localhost:5174. To validate and run the production server:

```sh
npm run typecheck
npm run build
npm test
npm start
```

Production listens on port 3000 by default. Set `PORT` and `HOST` as needed.

## Docker

From this directory:

```sh
docker compose up --build -d
```

Open http://localhost:3000. Set `WEBSITE_PORT=8080` before the command to expose a different host port. Stop with `docker compose down`. The multi-stage image includes only the Remix production build and production dependencies, runs as a non-root user, and includes an HTTP health check. Compose supplies a read-only filesystem and a temporary `/tmp` volume. Put a TLS reverse proxy in front of the container for public hosting.

## Vercel container deployment

Production: [dextana.vercel.app](https://dextana.vercel.app). The project is `team9tech-2299s-projects/dextana`. The initial production deployment was uploaded using the CLI; automatic GitHub deployments are not connected.

Run these commands from `website/` after signing in to the Vercel account that should own the site:

```sh
npx vercel login
npx vercel deploy --prod
```

Vercel detects `Dockerfile.vercel`, builds the container, and routes requests to it. Keep `Dockerfile.vercel` identical to `Dockerfile` when changing the image. `vercel.json` sets the runtime `PORT` to 3000 so Vercel routes to the same port as Remix and the health check. The `.vercelignore` file excludes local dependencies, generated builds, Sites metadata, tests, and environment files. The deployment root must be `website/`, not the desktop repository root. Account/project links in `.vercel/` are local and ignored by Git and Docker.

Vercel's OCI builder ignores the Docker `HEALTHCHECK` instruction; verify the public homepage and assets after deployment. Local Docker and Compose retain the image health check.

See [Vercel container image documentation](https://vercel.com/docs/functions/container-images).

## Content and downloads

Edit `app/routes/_index.tsx` for the page and `app/content.ts` for prompts, FAQ copy, repository and download links. Styling lives in `app/styles.css`; `app/assets/dext-logo.svg` is copied from the desktop brand asset and bundled with a content-hashed URL so logo updates do not reuse a cached image. `public/icon.svg` remains for older links.

The dropdown starts without a platform selected. Selecting macOS, Windows, or Linux reveals the architecture, installer format, instructions, and a “Download for [platform]” button. These are direct public GitHub release assets: DMG for macOS Apple silicon, EXE for Windows x64, and AppImage for Linux x64. No-JavaScript links target the same installers. No GitHub login is needed.

The durable URLs use `releases/download/desktop-alpha/Dextana-{platform}-{architecture}.{extension}`. The Publish desktop downloads workflow refreshes this rolling alpha only after a successful main-branch packaging run, verifies all three installers against their CI checksums, and publishes the installers plus `SHA256SUMS`. Release notes identify the exact tested commit and run. Do not replace these with expiring Actions artifacts or signed storage URLs. Version and size are deliberately omitted from the selector so they cannot become stale when the rolling alpha updates. The local `release/` files are not uploaded by this website.

The hero and activity-context panel are illustrative workflows, labelled Example, not live agent sessions. The context section explains selecting files, sharing links and follow-up instructions, read approval, and saved references. Example prompts can be copied, and the FAQ uses native accessible disclosure controls. Core content and navigation work without JavaScript. Fonts are bundled and served locally through Fontsource; the page does not load third-party fonts, analytics, or tracking scripts.

## Optional static hosting

```sh
npm run build:static
```

This prerenders the same Remix homepage and a 404 page into `dist/`, including its client assets, for static hosting. Docker uses the normal Remix Node server and does not require Sites. `.openai/hosting.json` records the separate private Sites preview.

## Dependency audit

The build and runtime checks pass, but `npm audit` currently reports inherited Remix 2 dependency advisories, including a critical development-only `tar` advisory and runtime advisories in the router, `qs`, and `turbo-stream`. A compatible `npm audit fix` made no changes. This page has no forms, actions, user-controlled link destinations, or single-fetch opt-in, but it is not a clean dependency audit. Do not enable single-fetch or accept untrusted content without reviewing those advisories. The static preview serves built files and does not run these Node dependencies. Reassess the supported framework release or patched dependencies before public Node hosting.

## Licence and ownership links

Repository and installer links use `Usefused/Dextana` directly. `public/license.txt` mirrors the root Dextana No-Resale License and is publicly readable without GitHub access. Keep both copies in sync. The homepage states the current licence without historical messaging. Installer packages must be rebuilt with the included licence before distributing them under these terms.
