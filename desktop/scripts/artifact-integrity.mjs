import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [mode, output = 'release', keyPath = 'packaging/artifact-signing-public.pem'] = process.argv.slice(2);
const directory = resolve(output);
const manifestPath = join(directory, 'SHA256SUMS');
const signaturePath = join(directory, 'SHA256SUMS.sig');
const isArtifact = (name) => /^[A-Za-z0-9][A-Za-z0-9._-]*\.(dmg|zip|exe|AppImage)$/.test(name);

async function artifactNames() {
  const names = (await readdir(directory)).filter(isArtifact).sort();
  if (!names.length) throw new Error('No installer artifacts found.');
  return names;
}

async function hash(name) {
  const path = join(directory, name);
  if (!(await lstat(path)).isFile()) throw new Error(`Artifact is not a regular file: ${name}`);
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

async function createManifest() {
  const lines = [];
  for (const name of await artifactNames()) lines.push(`${await hash(name)}  ${name}\n`);
  const manifest = Buffer.from(lines.join(''));
  await rm(signaturePath, { force: true });
  await writeFile(manifestPath, manifest);
  return manifest;
}

async function trustedKey() {
  const key = createPublicKey(await readFile(keyPath));
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Expected an Ed25519 public key.');
  return key;
}

async function verifyArtifacts() {
  const manifest = await readFile(manifestPath);
  const signature = await readFile(signaturePath);
  if (signature.length !== 64 || !verify(null, manifest, await trustedKey(), signature))
    throw new Error('Checksum signature is invalid.');
  const lines = manifest.toString('utf8').split('\n');
  if (lines.pop() !== '') throw new Error('Malformed checksum manifest.');
  const names = new Set();
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!match || !isArtifact(match[2]) || names.has(match[2]))
      throw new Error('Malformed or duplicate artifact entry.');
    const [, expected, name] = match;
    names.add(name);
    if (await hash(name) !== expected) throw new Error(`Artifact checksum mismatch: ${name}`);
  }
  if (JSON.stringify([...names].sort()) !== JSON.stringify(await artifactNames()))
    throw new Error('The manifest does not cover every installer in this directory.');
  console.log(`Verified signature and SHA-256 checksums for ${names.size} artifact(s).`);
}

try {
  if (mode === 'create') {
    await createManifest();
    console.log('Created SHA256SUMS (unsigned).');
  } else if (mode === 'sign') {
    if (!process.env.DEXTANA_ARTIFACT_SIGNING_KEY) throw new Error('Artifact signing key is missing.');
    const privateKey = createPrivateKey(process.env.DEXTANA_ARTIFACT_SIGNING_KEY);
    if (privateKey.asymmetricKeyType !== 'ed25519' || !createPublicKey(privateKey).equals(await trustedKey()))
      throw new Error('The signing key does not match the pinned public key.');
    const manifest = await createManifest();
    await writeFile(signaturePath, sign(null, manifest, privateKey));
    await verifyArtifacts();
  } else if (mode === 'verify') {
    await verifyArtifacts();
  } else {
    throw new Error('Usage: node scripts/artifact-integrity.mjs create|sign|verify [directory] [trusted-public-key]');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
