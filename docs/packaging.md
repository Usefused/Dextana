# Desktop packaging

Dextana installers include Electron, the compiled managed-ADK backend, and a private CPython runtime with the backend's locked production dependencies. End users install neither Harnest nor Python. The desktop launches the compiled artifact directly with its bundled interpreter; it never runs the Harnest CLI. Ollama remains the configurable model server.

The native product name, bundle display name, executable, application ID (`com.dextana.desktop`), and icons are set by [electron-builder.yml](../electron-builder.yml). The icon spells **DxT**; `assets/icon.svg` is the editable vector source. `npm run icons` regenerates PNG, ICNS, and ICO assets without depending on system fonts. The development Electron launcher can retain the Electron name in macOS menus; run the packaged `Dextana.app` to use the actual native identity.

## Local build

Use Node 24 and the Harnest 0.16.0 compiler on the build machine:

```sh
npm ci
npm run pack             # unpacked application in release/
npm run test:packaged    # real packaged-app flow, no Harnest/Python on PATH
npm run dist             # native installers in release/
```

`npm run backend:build` compiles an isolated copy of the authored agent, synchronizes its frozen runtime lock, and copies a relocatable Harnest-managed Python distribution plus production libraries into `.build/backend`. It validates imports using the copied interpreter. The original agent's `.harnest` directory is untouched. Source/runtime/platform fingerprints avoid recompiling an unchanged backend. `npm start` and `npm run test:e2e` prepare this backend automatically.

The build rejects a system/framework Python prefix and rejects packaging a backend for a different OS or CPU architecture. Build each target natively. Backend files live outside ASAR under the app's resources; runtime working files live in the owner's application-data directory. Python bytecode writes are disabled, and isolated interpreter mode ignores external Python paths. The existing `dextana` application-data directory is preserved despite the product-name capitalisation.

## CI

[Package Dextana](../.github/workflows/package.yml) runs on relevant pull requests, `v*` tags, and manual dispatch. Native macOS, Ubuntu, and Windows jobs:

1. Install Node 24 and locked npm dependencies, then run unit tests.
2. Download the build-only compiler from [Usefused/harnest v0.16.0](https://github.com/Usefused/harnest/releases/tag/v0.16.0), checking the committed SHA-256 for that OS/architecture in [harnest-release.json](../packaging/harnest-release.json).
3. Compile the backend and build native installers with [electron-builder](https://www.electron.build/docs/configuration/).
4. Launch the packaged app with Harnest and Python removed from `PATH`, connect a local test Ollama server, and run a complete agent response. Linux uses Xvfb.
5. Upload DMG/ZIP, NSIS/ZIP, or AppImage artifacts only after the packaged test passes. Failures retain traces and compiler logs.

A release tag must match `package.json` (for example, `v0.1.0`). Changing the compiler version requires updating its pinned asset checksums, the backend build version check, and agent locks together. The release compiler is used only in CI/build directories and is excluded from installers. The included dependency licence metadata and CPython licence files remain with the runtime.

These are unsigned, unnotarized alpha packages. CI disables signing-identity discovery and does not publish a GitHub release or configure automatic updates. Signing/notarization can be added when distribution credentials are available. Download installers from the successful workflow's artifacts.
