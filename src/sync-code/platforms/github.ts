import { config } from '../../config';
import { execSync } from 'child_process';
import { getRepoUrl } from '../repos';

export interface RepoInfo {
  name: string;
  defaultBranchRef: {
    name: string;
    target: {
      oid: string;
    };
  };
  pushedAt: string;
}

function extractOwnerRepo(repo: string): { owner: string; repo: string } {
  const url = getRepoUrl(repo);
  // Handle both https://github.com/owner/repo.git and owner/repo formats
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!match) {
    throw new Error(`Invalid GitHub URL format: ${url}`);
  }
  return { owner: match[1], repo: match[2] };
}

export async function createPR(
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string = 'main'
): Promise<string> {
  const { owner, repo: repoName } = extractOwnerRepo(repo);

  let output = '';

  if (process.platform === 'win32') {
    // On Windows, use temp file for body to handle newlines properly
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const tmpFile = path.join(os.tmpdir(), `pr_body_${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, body, 'utf-8');

    let cmd = `gh pr create --repo "${owner}/${repoName}" --title "${title.replace(/"/g, '\\"')}" --body-file "${tmpFile}" --head "${head}" --base "${base}"`;
    if (config.prDraft) cmd += ' --draft';

    try {
      output = execSync(`cmd /c "${cmd}"`, { encoding: 'utf-8' });
    } finally {
      // Clean up temp file
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  } else {
    // On Unix, use inline body
    let cmd = `gh pr create --repo "${owner}/${repoName}" --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" --head "${head}" --base "${base}"`;
    if (config.prDraft) cmd += ' --draft';
    output = execSync(cmd, { encoding: 'utf-8' });
  }

  return output.trim();
}

export async function getRepoInfo(repo: string): Promise<RepoInfo> {
  const { owner, repo: repoName } = extractOwnerRepo(repo);
  const cmd = `gh repo view ${owner}/${repoName} --json name,defaultBranchRef,pushedAt`;

  try {
    const output = execSync(cmd, { encoding: 'utf-8' });
    return JSON.parse(output) as RepoInfo;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get repo info: ${msg}`);
  }
}

export async function getCurrentCommit(repo: string, branch: string): Promise<string> {
  const { owner, repo: repoName } = extractOwnerRepo(repo);
  const cmd = `gh api repos/${owner}/${repoName}/git/ref/heads/${branch} --jq '.object.sha'`;

  try {
    const output = execSync(cmd, { encoding: 'utf-8' });
    return output.trim();
  } catch {
    return '';
  }
}

export async function checkAuth(): Promise<boolean> {
  try {
    execSync('gh auth status', { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}
