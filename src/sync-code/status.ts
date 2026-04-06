import { loadManifest, getIncludedFiles } from './manifest';

export interface StatusResult {
  tracked: string[];
  modified: string[];
  total: number;
}

export async function status(repo: string, localPath: string): Promise<StatusResult> {
  const manifest = loadManifest(localPath);
  const includedFiles = await getIncludedFiles(localPath, manifest);

  return {
    tracked: includedFiles,
    modified: [], // Would need git status
    total: includedFiles.length,
  };
}
