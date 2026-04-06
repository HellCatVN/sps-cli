import { cloneOrPull, getDirectoryDiff, FileDiff } from './git-ops';
import { loadManifest, getIncludedFiles } from './manifest';
import { validateConfig } from '../config';
import { getRepoUrl } from './repos';
import path from 'path';
import fs from 'fs';

export interface DiffResult {
  included: FileDiff[];
  excluded: FileDiff[];
  total: number;
}

export async function diff(repo: string, localPath: string): Promise<DiffResult> {
  validateConfig();

  // 1. Pull remote to temp/pull dir for comparison
  const pullDir = path.join('.sps-cli', 'tmp', 'pull', repo.replace(/[\/\\]/g, '_'));
  const remoteUrl = getRepoUrl(repo);
  await cloneOrPull(remoteUrl, pullDir);

  try {
    // 2. Get manifest patterns from local node-api
    const manifest = loadManifest(localPath);
    const includedFiles = await getIncludedFiles(localPath, manifest);

    // 3. Compare pull dir (remote) vs local node-api
    const changes = await getDirectoryDiff(pullDir, localPath);

    // 4. Filter by manifest (normalize paths to forward slashes)
    const normalizedIncludedFiles = includedFiles.map(f => f.replace(/\\/g, '/'));
    const filteredChanges = changes.filter(f => normalizedIncludedFiles.includes(f.file));
    const excludedChanges = changes.filter(f => !normalizedIncludedFiles.includes(f.file));

    return {
      included: filteredChanges,
      excluded: excludedChanges,
      total: changes.length,
    };
  } finally {
    // Temp dir intentionally kept for reuse on next diff
  }
}
