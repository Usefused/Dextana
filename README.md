# Dextana

This repository keeps each deployable part in its own top-level folder:

- [`desktop/`](desktop/) — the Electron desktop app, Harnest agent, browser extension, tests, evaluations, packaging, and desktop documentation.
- [`website/`](website/) — the public Dextana website.
- [`services/integrations/`](services/integrations/) — the integrations service.
- [`integrations/`](integrations/) — portable Fused integration definitions and generated SDKs.

To develop the desktop app:

```sh
cd desktop
npm ci
harnest env sync agent --profile runtime --frozen
npm start
```

See the [desktop README](desktop/README.md) for architecture, development, testing, and packaging details. The repository is licensed under the [Dextana No-Resale License](LICENSE).
