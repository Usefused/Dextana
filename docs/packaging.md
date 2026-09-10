# Desktop packaging

Dextana installers include Electron, the compiled managed-ADK backend, and a private CPython runtime with the backend's locked production dependencies. End users install neither Harnest nor Python. The desktop launches the compiled artifact directly with its bundled interpreter; it never runs the Harnest CLI. Ollama remains the configurable model server.

The native product name, bundle display name, executable, application ID (`com.dextana.desktop`), and icons are set by [electron-builder.yml](../electron-builder.yml). `assets/icon.svg` is the editable vector source. `npm run icons` regenerates PNG, ICNS, and ICO assets without depending on system fonts. The development Electron launcher can retain the Electron name in macOS menus; run the packaged `Dextana.app` to use the actual native identity.

The product and installed app remain **Dextana**. The macOS installer volume and descriptive app metadata use **Dextana by Fused**, and package author metadata identifies **Fused**. The technical app ID remains `com.dextana.desktop` so existing OS integration retains its identity; a display label with spaces is not a bundle identifier. Publisher branding does not replace a trusted signing certificate.

The DMG uses a 720 × 480 window, 144-pixel draggable icons, 16-point icon labels, and instructions to drag the app into Applications before opening it. Its background includes a Retina representation. Edit `assets/dmg-background.svg`, then run `npm run installer:artwork` on macOS to regenerate the committed PNGs using the native Helvetica Neue font. CI consumes those PNGs without a font-generation dependency.

## Local build

Use Node 24 and the Harnest 0.18.0 compiler on the build machine:

```sh
npm ci
npm run pack             # unpacked application in release/
npm run test:packaged    # real packaged-app flow, no Harnest/Python on PATH
npm run dist             # native installers in release/
npm run test:mac-installers # macOS: verify DMG/ZIP bundles and tamper detection
```

`npm run backend:build` compiles an isolated copy of the authored agent, synchronizes its frozen runtime lock, and copies a relocatable Harnest-managed Python distribution plus production libraries into `.build/backend`. It validates imports using the copied interpreter. The original agent's `.harnest` directory is untouched. Source/runtime/platform fingerprints avoid recompiling an unchanged backend. `npm start` and `npm run test:e2e` prepare this backend automatically.

The build rejects a system/framework Python prefix and rejects packaging a backend for a different OS or CPU architecture. Build each target natively. Backend files live outside ASAR under the app's resources; runtime working files live in the owner's application-data directory. Python bytecode writes are disabled, and isolated interpreter mode ignores external Python paths. The existing `dextana` application-data directory is preserved despite the product-name capitalisation.

On macOS, keep the packaging output outside iCloud or other synced folders: Finder metadata added to `.app` bundles can make code signing fail with “resource fork, Finder information, or similar detritus not allowed.” Pass `--config.directories.output=/private/tmp/dextana-release` to electron-builder for a local output directory, then set `DEXTANA_RELEASE_DIR` to that path when running `test:packaged` and `test:mac-installers`. The completed DMG/ZIP files can be copied back afterwards.

## CI

[Package Dextana](../.github/workflows/package.yml) runs on pushes to `main`, relevant pull requests, `v*` tags, and manual dispatch in the current repository. Main-branch builds create CI installers with unsigned checksums; release tags keep their required publisher signing and notarization. Native macOS, Ubuntu, and Windows jobs:

1. Install Node 24 and locked npm dependencies, then run unit tests.
2. Download the build-only compiler from [Usefused/harnest v0.18.0](https://github.com/Usefused/harnest/releases/tag/v0.18.0), checking the committed SHA-256 for that OS/architecture in [harnest-release.json](../packaging/harnest-release.json).
3. Synchronize the frozen development lock and run the authored backend tests with `npm run test:backend`, then compile the frozen production profile and build native installers with [electron-builder](https://www.electron.build/docs/configuration/).
4. On macOS, verify the complete app signature, mount the DMG read-only and extract the ZIP to verify their app signatures, and confirm that changing a resource in a disposable extracted copy invalidates its seal. Launch the packaged app with Harnest and Python removed from `PATH`, connect a local test Ollama server, and run a complete agent response. Linux uses Xvfb.
5. Upload DMG/ZIP, NSIS/ZIP, or AppImage artifacts only after the packaged test passes. Failures retain traces and compiler logs.

A release tag must match `package.json` (for example, `v0.1.0`). Changing the compiler version requires updating its pinned asset checksums, the backend build version check, and agent locks together. The release compiler is used only in CI/build directories and is excluded from installers. The included dependency licence metadata and CPython licence files remain with the runtime.

The repository's `.gitattributes` keeps text files in LF format on every runner. Harnest 0.18.0 rejects frozen lock headers converted to Windows CRLF line endings; consistent source bytes also preserve dependency fingerprints.

Both dependency locks use uv's universal resolution so Windows-only dependencies such as `pywin32` and `colorama` retain their platform markers and hashes. The private runtime also includes `tzdata`, since Windows has no system IANA timezone database. To refresh dependencies, run Harnest from the agent directory so the resolver reads `[tool.uv.pip]` in its `pyproject.toml`, then commit both regenerated locks:

```sh
cd agent
harnest env sync . --profile runtime
harnest env sync . --profile development
```

## Signatures and checksums

`npm run pack` and `npm run dist` use [electron-builder.adhoc.cjs](../electron-builder.adhoc.cjs) to apply a complete ad-hoc macOS signature, including nested code and sealed resources. Skipping signing leaves Electron's original linker signature attached to a modified bundle, which macOS reports as damaged. The build uses electron-builder's Electron entitlements, including JIT and disabled library validation for the ad-hoc hardened runtime. Publisher-signed builds use their separate configuration and never inherit the ad-hoc identity.

An ad-hoc signature detects changes to sealed files but does not authenticate Dextana's publisher or meet Gatekeeper's default trust requirements. It can be replaced by anyone. For normal download-and-open installation, use a Developer ID signature and Apple notarization. For a trusted test build, copy the app into Applications and explicitly allow it in System Settings → Privacy & Security after trying to open it. Do not disable Gatekeeper globally or use that override for an unexpected download. Replace older malformed bundles with a rebuilt installer before attempting an override.

Every installer group includes `SHA256SUMS`. Manual packaging signs that manifest by default with Ed25519 and verifies it before upload; pull requests produce explicitly unsigned checksums and never receive the private signing key. The private key belongs only in the `DEXTANA_ARTIFACT_SIGNING_KEY` Actions secret. The trusted public key is committed at `packaging/artifact-signing-public.pem` (SHA-256 of its DER encoding: `66a76a1bd26eb8d339ef58a78048ccc87c11ce98a29585ec3d5725530607452c`).

Extract one platform's artifact download into a directory, then verify it from a trusted Dextana checkout:

```sh
npm run verify:artifacts -- /path/to/downloaded/installers
```

Verification checks the signature on `SHA256SUMS` before comparing every installer against its SHA-256 digest. Changing an installer fails the digest check; changing its checksum also invalidates the signature. Keep the verification key from a trusted source: replacing both a downloaded key and its signature would defeat verification. A valid signature establishes integrity and origin, not freshness or an absence of software defects.

The **Package Dextana** workflow's optional `tested_run` and `tested_commit` inputs invoke **Sign tested installer checksums** without rebuilding. It requires the exact successful packaging run ID and commit SHA, rejects pull-request builds, and signs only artifacts from that first-party run. This does not add native publisher signatures to those binaries; `native_signing` must be off when using an existing build.

Native publisher signing is separate. `v*` tags and the manual **native_signing** option use `npm run dist:signed`, fail when credentials are missing, and verify native signatures after packaging. macOS requires a Developer ID Application certificate (`MACOS_CSC_LINK` and `MACOS_CSC_KEY_PASSWORD`) and notarization credentials (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`). Windows requires a trusted certificate (`WINDOWS_CSC_LINK`, `WINDOWS_CSC_KEY_PASSWORD`); a hardware-backed/cloud signing provider will need its provider integration instead of a certificate file. The Windows hook includes native executables, DLLs and Python extensions in the private backend. macOS verifies the sealed app, Gatekeeper assessment and notarization ticket. Linux uses the signed checksum manifest.

Until Apple and Windows signing credentials are configured, native publisher signing remains unavailable. CI-only bundles can still carry signed checksum manifests, but they are not Apple-notarized or Windows verified-publisher releases. CI does not publish a GitHub release or configure automatic updates.

## Dextana licence

New packages include the root `LICENSE` as `resources/LICENSE`. Package metadata refers to that Dextana No-Resale License. It permits personal and business work but requires written permission from Fused for resale, paid redistribution, and paid access to the app. Third-party licences remain unchanged. Rebuild installers with the included licence before distributing them under these terms.
