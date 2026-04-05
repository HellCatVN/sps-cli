import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface FileDiff {
  file: string;
  additions: number;
  deletions: number;
}

/**
 * Convert Windows backslashes to forward slashes for shell commands
 */
function toShellPath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Shell exec helper with error handling
 */
function exec(cmd: string, options: Record<string, unknown> = {}): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', ...options } as Parameters<typeof execSync>[1]) as string;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Shell failed: ${msg}\nCommand: ${cmd}`);
  }
}

/**
 * Check if gh-cli is available and authenticated
 */
function isGhAvailable(): boolean {
  try {
    exec('gh auth status', {});
    return true;
  } catch {
    return false;
  }
}

/**
 * Clone or pull - gh-cli primary, git-cli fallback
 */
export async function cloneOrPull(
  repoUrl: string,
  localPath: string
): Promise<void> {
  const exists = fs.existsSync(localPath);
  const isGitRepo = exists && fs.statSync(localPath).isDirectory() &&
    fs.existsSync(path.join(localPath, '.git'));

  if (!exists || !isGitRepo) {
    // Clean and re-clone if not exists or not a valid git repo
    if (exists) {
      fs.rmSync(localPath, { recursive: true, force: true });
    }
    console.log(`Cloning ${repoUrl} to ${localPath}...`);
    await ghCloneOrGitClone(repoUrl, localPath);
  } else {
    console.log(`Pulling ${localPath}...`);
    exec(`git pull`, { cwd: localPath });
  }
}

/**
 * gh-cli primary clone, git-cli fallback
 */
async function ghCloneOrGitClone(repoUrl: string, localPath: string): Promise<void> {
  const parentDir = path.dirname(localPath);
  const repoName = path.basename(localPath);

  if (isGhAvailable()) {
    try {
      // gh repo clone owner/repo [directory]
      exec(`gh repo clone "${repoUrl}" "${repoName}"`, { cwd: parentDir });
      return;
    } catch {
      // Fall through to git
    }
  }

  // Fallback to git cli
  exec(`git clone "${repoUrl}" "${localPath}" --progress`);
}

export async function getModifiedFiles(
  localPath: string,
  baseCommit: string = 'HEAD'
): Promise<string[]> {
  try {
    const diff = exec(`git diff "${baseCommit}..HEAD" --name-only`, { cwd: localPath });
    const stashed = exec(`git diff --name-only`, { cwd: localPath });
    const combined = (diff + '\n' + stashed).split('\n').filter(Boolean);
    return [...new Set(combined)];
  } catch {
    return [];
  }
}

export async function stageFiles(
  localPath: string,
  files: string[]
): Promise<void> {
  if (files.length === 0) return;
  const fileList = files.map(f => `"${f}"`).join(' ');
  exec(`git add ${fileList}`, { cwd: localPath });
}

export async function commitFiles(
  localPath: string,
  message: string
): Promise<string> {
  const output = exec(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: localPath });
  // Extract commit hash from output like "[branch abc123] message"
  const match = output.match(/\[([^\]]+)\]\s*(\S+)/);
  return match ? match[2] : '';
}

export async function pushBranch(
  localPath: string,
  branchName: string,
  remote: string = 'origin'
): Promise<void> {
  exec(`git push -u "${remote}" "${branchName}"`, { cwd: localPath });
}

export async function createBranch(
  localPath: string,
  branchName: string
): Promise<void> {
  exec(`git checkout -b "${branchName}"`, { cwd: localPath });
}

export async function getCurrentBranch(localPath: string): Promise<string> {
  const output = exec(`git branch --show-current`, { cwd: localPath });
  return output.trim();
}

export async function getRemoteCommit(
  localPath: string,
  remote: string = 'origin'
): Promise<string> {
  try {
    const output = exec(`git rev-parse "${remote}/HEAD`, { cwd: localPath });
    return output.trim();
  } catch {
    return 'HEAD';
  }
}

export async function getDirectoryDiff(
  basePath: string,
  comparePath: string
): Promise<FileDiff[]> {
  // Uses git diff --no-index to compare two directories
  // --exit-code makes git exit 0 if identical, 1 if different
  // Must use absolute paths since shell:true doesn't preserve cwd for git's paths
  const absBasePath = path.resolve(basePath);
  const absComparePath = path.resolve(comparePath);
  const cmd = `git diff --no-index --stat=99999 --exit-code "${toShellPath(absBasePath)}" "${toShellPath(absComparePath)}"`;

  // git diff --no-index --exit-code returns 1 when differences found
  // shell:true needed for || operator on Windows
  const windowsFix = process.platform === 'win32' ? '||cmd /c exit 0' : '||true';
  const fullCmd = `${cmd} ${windowsFix}`;
  let output = '';
  try {
    const result = execSync(fullCmd, { encoding: 'utf-8', stdio: 'pipe' });
    output = String(result);
  } catch (e) {
    // Non-zero exit expected - output was produced before error
    const err = e as Error & { stdout?: Buffer };
    if (err.stdout) {
      output = String(err.stdout);
    }
  }

  return output.split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return trimmed &&
        trimmed.startsWith('/dev/null =>') &&
        !trimmed.includes('.git/') &&
        !trimmed.includes('=> /dev/null');
    })
    .map(line => {
      const arrowParts = line.split('=>');
      if (arrowParts.length !== 2) return null;

      let filePath = arrowParts[1].trim().split('|')[0].trim();
      const statPart = arrowParts[1].trim().split('|')[1] || '';
      const addMatch = statPart.match(/(\d+)\s*\+/);
      const delMatch = statPart.match(/(\d+)\s*-/);
      const additions = addMatch ? parseInt(addMatch[1], 10) : 0;
      const deletions = delMatch ? parseInt(delMatch[1], 10) : 0;

      // Remove path prefix to get relative path
      filePath = filePath.replace(/^.*\/node-api\//, '');

      return { file: filePath, additions, deletions };
    })
    .filter((item): item is FileDiff => item !== null && item.file.length > 0);
}
