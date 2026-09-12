const env = process.env;
if (process.platform === 'darwin') {
  if (!env.CSC_LINK) throw new Error('Signed macOS releases require CSC_LINK with a Developer ID Application certificate.');
  const apiKey = env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER;
  const account = env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID;
  const keychain = env.APPLE_KEYCHAIN && env.APPLE_KEYCHAIN_PROFILE;
  if (!apiKey && !account && !keychain) throw new Error('Signed macOS releases require Apple notarization credentials.');
} else if (process.platform === 'win32' && !env.WIN_CSC_LINK && !env.CSC_LINK) {
  throw new Error('Signed Windows releases require a trusted code-signing certificate via WIN_CSC_LINK or CSC_LINK.');
}
