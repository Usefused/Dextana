// CI and local builds must seal the entire bundle, even without a Developer ID.
// electron-builder's macOS entitlements include allow-jit and
// disable-library-validation, which Electron needs with ad-hoc hardened runtime.
// Publisher-signed builds extend the base config separately.
module.exports = {
  extends: './electron-builder.yml',
  mac: { identity: '-', notarize: false },
};
