import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const mobileSrcRoot = path.join(repoRoot, 'apps', 'mobile', 'src');
const supportRoot = path.join(repoRoot, 'tests', 'support');

const stubModules = new Map([
  ['expo-linking', path.join(supportRoot, 'expo-linking-stub.mjs')],
  ['expo-web-browser', path.join(supportRoot, 'expo-web-browser-stub.mjs')],
  ['zod', path.join(supportRoot, 'zod-lite.mjs')],
]);

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith('@/')) {
    const resolvedPath = resolveMobileSourcePath(specifier.slice(2));

    return {
      shortCircuit: true,
      url: pathToFileURL(resolvedPath).href,
    };
  }

  const stubPath = stubModules.get(specifier);

  if (stubPath) {
    return {
      shortCircuit: true,
      url: pathToFileURL(stubPath).href,
    };
  }

  return defaultResolve(specifier, context, defaultResolve);
}

function resolveMobileSourcePath(specifierPath) {
  const candidateBasePath = path.join(mobileSrcRoot, specifierPath);
  const candidates = [
    candidateBasePath,
    `${candidateBasePath}.ts`,
    `${candidateBasePath}.tsx`,
    `${candidateBasePath}.js`,
    `${candidateBasePath}.mjs`,
    path.join(candidateBasePath, 'index.ts'),
    path.join(candidateBasePath, 'index.tsx'),
    path.join(candidateBasePath, 'index.js'),
    path.join(candidateBasePath, 'index.mjs'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to resolve mobile source specifier: @/${specifierPath}`);
}
