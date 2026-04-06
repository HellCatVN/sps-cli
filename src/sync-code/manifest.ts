import { glob } from 'glob';
import path from 'path';
import fs from 'fs';

export interface Manifest {
  name: string;
  version?: string;
  sync: {
    include: string[];
    exclude: string[];
  };
}

export async function getIncludedFiles(
  root: string,
  manifest: Manifest
): Promise<string[]> {
  const allFiles: string[] = [];

  for (const pattern of manifest.sync.include) {
    const files = await glob(pattern, { cwd: root, absolute: false });
    allFiles.push(...files);
  }

  // Remove excluded files
  for (const pattern of manifest.sync.exclude) {
    const excluded = await glob(pattern, { cwd: root, absolute: false });
    for (const file of excluded) {
      const index = allFiles.indexOf(file);
      if (index > -1) allFiles.splice(index, 1);
    }
  }

  return [...new Set(allFiles)].sort();
}

export function loadManifest(root: string): Manifest {
  const manifestPath = path.join(root, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }
  const content = fs.readFileSync(manifestPath, 'utf-8');
  return JSON.parse(content) as Manifest;
}

export async function getManifestFiles(
  root: string
): Promise<{ included: string[]; excluded: string[] }> {
  const manifest = loadManifest(root);
  const included = await getIncludedFiles(root, manifest);

  // Get all files in repo
  const allFiles = await glob('**/*', { cwd: root, absolute: false, nodir: true });
  const excluded = allFiles.filter(f => !included.includes(f));

  return { included, excluded };
}
