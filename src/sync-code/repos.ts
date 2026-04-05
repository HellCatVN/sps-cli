import fs from 'fs';
import path from 'path';

interface ReposConfig {
  [key: string]: string;
}

let reposCache: ReposConfig | null = null;

export function loadRepos(): ReposConfig {
  if (reposCache) return reposCache;

  const reposPath = path.resolve(process.cwd(), 'repos.json');
  if (!fs.existsSync(reposPath)) {
    throw new Error(`repos.json not found at ${reposPath}`);
  }

  const content = fs.readFileSync(reposPath, 'utf-8');
  reposCache = JSON.parse(content) as ReposConfig;
  return reposCache;
}

export function getRepoUrl(name: string): string {
  const repos = loadRepos();
  const url = repos[name];
  if (!url) {
    throw new Error(`Repo "${name}" not found in repos.json. Available: ${Object.keys(repos).join(', ')}`);
  }
  return url;
}

export function getRepoName(url: string): string {
  const repos = loadRepos();
  const entry = Object.entries(repos).find(([, v]) => v === url);
  return entry ? entry[0] : url;
}
