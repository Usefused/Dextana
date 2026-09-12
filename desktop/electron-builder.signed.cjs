module.exports = {
  extends: './electron-builder.yml',
  forceCodeSigning: true,
  mac: { notarize: true },
  win: { signExts: ['.dll', '.pyd'], signtoolOptions: { signingHashAlgorithms: ['sha256'] } },
  afterPack: 'packaging/sign-backend.cjs',
};
