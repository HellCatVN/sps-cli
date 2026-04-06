import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { checkAuth } from '../sync-code/platforms/github';

export interface DoctorResult {
  name: string;
  status: 'ok' | 'fail' | 'warn';
  message: string;
}

function exec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' }) as string;
  } catch {
    return '';
  }
}

function checkGitInstalled(): DoctorResult {
  try {
    const output = exec('git --version');
    const match = output.match(/git version (\S+)/);
    const version = match ? match[1] : output.trim();
    return { name: 'git', status: 'ok', message: version };
  } catch {
    return { name: 'git', status: 'fail', message: 'not installed' };
  }
}

function checkGhInstalled(): DoctorResult {
  try {
    const output = exec('gh --version');
    const match = output.match(/gh version (\S+)/);
    const version = match ? match[1] : output.trim();
    return { name: 'gh', status: 'ok', message: version };
  } catch {
    return { name: 'gh', status: 'fail', message: 'not installed' };
  }
}

async function checkGhAuth(): Promise<DoctorResult> {
  const isAuth = await checkAuth();
  if (isAuth) {
    try {
      const output = exec('gh auth status --json viewerLogin 2>/dev/null || gh api user --jq .login 2>/dev/null || echo ""');
      const login = output.trim();
      if (login) {
        return { name: 'gh auth', status: 'ok', message: `authenticated as ${login}` };
      }
      return { name: 'gh auth', status: 'ok', message: 'authenticated' };
    } catch {
      return { name: 'gh auth', status: 'ok', message: 'authenticated' };
    }
  }
  return { name: 'gh auth', status: 'fail', message: 'not authenticated' };
}

function checkEnvFile(localPath: string): DoctorResult {
  const envPaths = [
    path.resolve(localPath, '.env'),
    path.resolve(process.cwd(), '.env'),
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const hasToken = content.includes('GITHUB_TOKEN=') && !content.match(/GITHUB_TOKEN\s*=\s*$/);
      if (!hasToken) {
        return { name: '.env GITHUB_TOKEN', status: 'warn', message: 'not set' };
      }
      const tokenValue = content.match(/GITHUB_TOKEN\s*=\s*(.+)/)?.[1]?.trim() || '';
      return { name: '.env GITHUB_TOKEN', status: 'ok', message: tokenValue ? 'set' : 'empty' };
    }
  }
  return { name: '.env', status: 'fail', message: 'not found' };
}

function checkReposJson(localPath: string): DoctorResult {
  const reposPaths = [
    path.resolve(localPath, 'repos.json'),
    path.resolve(process.cwd(), 'repos.json'),
  ];
  for (const reposPath of reposPaths) {
    if (fs.existsSync(reposPath)) {
      try {
        const content = fs.readFileSync(reposPath, 'utf-8');
        JSON.parse(content);
        return { name: 'repos.json', status: 'ok', message: 'valid' };
      } catch {
        return { name: 'repos.json', status: 'fail', message: 'invalid JSON' };
      }
    }
  }
  return { name: 'repos.json', status: 'fail', message: 'not found' };
}

function checkManifestJson(localPath: string): DoctorResult {
  const manifestPaths = [
    path.resolve(localPath, 'manifest.json'),
    path.resolve(localPath, 'node-api', 'manifest.json'),
    path.resolve(process.cwd(), 'manifest.json'),
  ];
  for (const manifestPath of manifestPaths) {
    if (fs.existsSync(manifestPath)) {
      try {
        const content = fs.readFileSync(manifestPath, 'utf-8');
        JSON.parse(content);
        return { name: 'manifest.json', status: 'ok', message: 'valid' };
      } catch {
        return { name: 'manifest.json', status: 'fail', message: 'invalid JSON' };
      }
    }
  }
  return { name: 'manifest.json', status: 'fail', message: 'not found' };
}

function checkNodeVersion(): DoctorResult {
  const version = process.version;
  const match = version.match(/v(\d+)/);
  if (match && parseInt(match[1], 10) >= 18) {
    return { name: 'node', status: 'ok', message: version };
  }
  return { name: 'node', status: 'fail', message: `${version} (requires 18+)` };
}

export async function doctor(localPath: string = process.cwd()): Promise<DoctorResult[]> {
  const results: DoctorResult[] = [];

  results.push(checkGitInstalled());
  results.push(checkGhInstalled());
  results.push(await checkGhAuth());
  results.push(checkEnvFile(localPath));
  results.push(checkReposJson(localPath));
  results.push(checkManifestJson(localPath));
  results.push(checkNodeVersion());

  return results;
}
