import { config } from '../../config';
import { execSync } from 'child_process';
import { getRepoUrl } from '../repos';

export interface GitLabRepoInfo {
  name: string;
  default_branch: string;
  last_activity_at: string;
}

function extractProjectPath(repo: string): string {
  const url = getRepoUrl(repo);
  // Handle gitlab URLs: https://gitlab.com/group/project.git or group/project
  const match = url.match(/gitlab\.com[/:]([^/]+)\/([^/.]+)/);
  if (!match) {
    throw new Error(`Invalid GitLab URL format: ${url}`);
  }
  return `${match[1]}%2F${match[2]}`;
}

export async function createMR(
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string = 'main'
): Promise<string> {
  const projectPath = extractProjectPath(repo);
  const cmd = `glab mr create --repo ${projectPath} --title "${title}" --description "${body}" --source-branch ${head} --target-branch ${base}`;

  try {
    const output = execSync(cmd, { encoding: 'utf-8' });
    const match = output.match(/https?:\/\/[^\s]+/);
    return match ? match[0] : 'MR created';
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create MR: ${msg}`);
  }
}

export async function getRepoInfo(repo: string): Promise<GitLabRepoInfo> {
  const projectPath = extractProjectPath(repo);
  const cmd = `glab api projects/${projectPath} --jq '{name, default_branch, last_activity_at}'`;

  try {
    const output = execSync(cmd, { encoding: 'utf-8' });
    return JSON.parse(output) as GitLabRepoInfo;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get repo info: ${msg}`);
  }
}

export async function checkAuth(): Promise<boolean> {
  try {
    execSync('glab auth status', { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}
