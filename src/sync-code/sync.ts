import { cloneOrPull } from './git-ops';
import { loadManifest, getIncludedFiles } from './manifest';
import { createPR } from './platforms/github';
import { diff } from './diff';
import { validateConfig } from '../config';
import { getRepoUrl } from './repos';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import chalk from 'chalk';
import readline from 'readline';

/**
 * Shell command helpers - gh-cli has higher priority than git-cli
 * All paths use forward slashes for cross-platform shell compatibility
 */
function toShellPath(p: string): string {
  // Convert Windows backslashes to forward slashes for shell commands
  return p.replace(/\\/g, '/');
}

/**
 * Prompt for confirmation (Y/n)
 */
function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(chalk.yellow(`${message} (Y/n): `), (answer) => {
      rl.close();
      resolve(answer.toLowerCase() !== 'n');
    });
  });
}

function exec(cmd: string, options: Record<string, unknown> = {}): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', ...options } as Parameters<typeof execSync>[1]) as string;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Shell failed: ${msg}\nCommand: ${cmd}`);
  }
}

function gitClone(url: string, dir: string): void {
  // gh-cli has higher priority, fallback to git-cli
  const parentDir = path.dirname(dir);
  const repoName = path.basename(dir);

  try {
    exec('gh auth status', {});
    exec(`gh repo clone "${url}" "${repoName}"`, { cwd: parentDir });
  } catch {
    exec(`git clone "${url}" "${toShellPath(dir)}" --progress`);
  }
}

function gitCheckoutNewBranch(branch: string, cwd: string): void {
  exec(`git checkout -b "${branch}"`, { cwd: toShellPath(cwd) });
}

function gitAdd(files: string[], cwd: string): void {
  if (files.length === 0) return;
  const shellCwd = toShellPath(cwd);
  exec(`git add ${files.map(f => `"${f}"`).join(' ')}`, { cwd: shellCwd });
}

function gitCommit(message: string, cwd: string): void {
  exec(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: toShellPath(cwd) });
}

function gitPush(branch: string, cwd: string): void {
  exec(`git push -u origin "${branch}"`, { cwd: toShellPath(cwd) });
}

export async function pull(repo: string, localPath: string): Promise<void> {
  validateConfig();

  const remoteUrl = getRepoUrl(repo);

  // diff() handles cloneOrPull into .sps-cli/tmp/pull/{repo} — don't call it here too
  const diffResult = await diff(repo, localPath);

  if (diffResult.included.length === 0) {
    console.log(chalk.green('✓ Already up to date — no changes to pull'));
    return;
  }

  // 3. Show pull preview
  console.log(chalk.cyan('─'.repeat(60)));
  console.log(chalk.cyan(' PULL PREVIEW '));
  console.log(chalk.cyan('─'.repeat(60)));
  console.log(chalk.red(`Files to overwrite: ${diffResult.included.length}`));
  console.log(chalk.cyan('─'.repeat(60)));
  const col1Width = 65;
  console.log(chalk.gray('  File' + ' '.repeat(col1Width - 4) + '|    +    |    -'));
  console.log(chalk.gray('  ' + '-'.repeat(col1Width) + '|--------|--------'));
  diffResult.included.forEach(f => {
    const name = f.file.length > col1Width ? f.file.slice(0, col1Width - 3) + '...' : f.file;
    const addStr = chalk.green(`+${f.additions}`);
    const delStr = f.deletions > 0 ? chalk.red(`-${f.deletions}`) : chalk.gray(`-${f.deletions}`);
    console.log(`  ${chalk.yellow(name.padEnd(col1Width))} | ${addStr.padStart(7)} | ${delStr.padStart(7)}`);
  });
  console.log(chalk.cyan('─'.repeat(60)));

  // 4. Confirm before overwrite
  const proceed = await confirm('Proceed with pull?');
  if (!proceed) {
    console.log(chalk.yellow('Pull cancelled.'));
    return;
  }

  // 5. Copy changed files from tmp to local
  const pullDir = path.join('.sps-cli', 'tmp', 'pull', repo.replace(/[\/\\]/g, '_'));
  for (const file of diffResult.included) {
    const srcPath = path.join(pullDir, file.file);
    const destPath = path.join(localPath, file.file);

    if (fs.existsSync(srcPath)) {
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(srcPath, destPath);
    }
  }

  console.log(chalk.green(`✓ Pulled ${repo} to ${localPath}`));
}

export async function push(
  repo: string,
  localPath: string,
  message?: string
): Promise<string> {
  validateConfig();

  // Use dedicated push dir: .sps-cli/tmp/push/{repo}
  const pushDir = path.join('.sps-cli', 'tmp', 'push', repo.replace(/[\/\\]/g, '_'));
  const remoteUrl = getRepoUrl(repo);

  // 1. Ensure push dir is fresh clone
  if (fs.existsSync(pushDir)) {
    fs.rmSync(pushDir, { recursive: true, force: true });
  }

  // Clone to push dir using gh-cli (higher priority) or git-cli fallback
  gitClone(remoteUrl, pushDir);

  // 2. Get manifest and diff from local source
  const diffResult = await diff(repo, localPath);

  if (diffResult.included.length === 0) {
    throw new Error('No changes to push');
  }

  // 2b. Show diff results before pushing
  console.log(chalk.cyan('─'.repeat(60)));
  console.log(chalk.cyan(' PUSH PREVIEW '));
  console.log(chalk.cyan('─'.repeat(60)));
  console.log(chalk.green(`Files to push: ${diffResult.included.length}`));
  console.log(chalk.cyan('─'.repeat(60)));
  const col1Width = 65;
  console.log(chalk.gray('  File' + ' '.repeat(col1Width - 4) + '|    +    |    -'));
  console.log(chalk.gray('  ' + '-'.repeat(col1Width) + '|--------|--------'));
  diffResult.included.forEach(f => {
    const name = f.file.length > col1Width ? f.file.slice(0, col1Width - 3) + '...' : f.file;
    const addStr = chalk.green(`+${f.additions}`);
    const delStr = f.deletions > 0 ? chalk.red(`-${f.deletions}`) : chalk.gray(`-${f.deletions}`);
    console.log(`  ${chalk.yellow(name.padEnd(col1Width))} | ${addStr.padStart(7)} | ${delStr.padStart(7)}`);
  });
  console.log(chalk.cyan('─'.repeat(60)));

  // 3. Confirm before push
  const proceed = await confirm('Proceed with push?');
  if (!proceed) {
    console.log(chalk.yellow('Push cancelled.'));
    process.exit(0);
  }

  // 4. Create new branch in push dir for PR
  const branchName = `sps-cli-push-${Date.now()}`;
  gitCheckoutNewBranch(branchName, pushDir);

  // 4. Copy tracked files from local source to push dir
  for (const file of diffResult.included) {
    const srcPath = path.join(localPath, file.file);
    const destPath = path.join(pushDir, file.file);

    if (fs.existsSync(srcPath)) {
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(srcPath, destPath);
    }
  }

  // 5. Stage, commit, and push from push dir
  const includedFileNames = diffResult.included.map(f => f.file);
  gitAdd(includedFileNames, pushDir);

  const commitMessage = message || `sps-cli: sync changes\n\nFiles: ${includedFileNames.join(', ')}`;
  gitCommit(commitMessage, pushDir);
  gitPush(branchName, pushDir);

  // 6. Create PR
  const prUrl = await createPR(
    repo,
    `sps-cli: ${commitMessage.split('\n')[0]}`,
    `Sync via sps-cli\n\nFiles changed: ${diffResult.included.length}\n\n${diffResult.included.map(f => `- ${f.file} (+${f.additions} -${f.deletions})`).join('\n')}`,
    branchName
  );

  return prUrl;
}

const SPS_CLI_REPO = 'HellCatVN/sps-cli';

export async function devPush(localPath: string, message?: string): Promise<string> {
  const pushDir = path.join('.sps-cli', 'tmp', 'dev-push', SPS_CLI_REPO.replace(/[\/\\]/g, '_'));
  const remoteUrl = `https://github.com/${SPS_CLI_REPO}.git`;

  // 1. Ensure push dir is fresh clone
  if (fs.existsSync(pushDir)) {
    fs.rmSync(pushDir, { recursive: true, force: true });
  }

  gitClone(remoteUrl, pushDir);

  // 2. Get manifest and diff from local sps-cli
  const manifest = loadManifest(localPath);
  const included = await getIncludedFiles(localPath, manifest);

  if (included.length === 0) {
    throw new Error('No changes to push');
  }

  // 3. Show push preview
  console.log(chalk.cyan('─'.repeat(60)));
  console.log(chalk.cyan(' DEV-PUSH PREVIEW '));
  console.log(chalk.cyan('─'.repeat(60)));
  console.log(chalk.green(`Files to push: ${included.length}`));
  console.log(chalk.cyan('─'.repeat(60)));
  const col1Width = 65;
  console.log(chalk.gray('  File' + ' '.repeat(col1Width - 4) + '|    +    |    -'));
  console.log(chalk.gray('  ' + '-'.repeat(col1Width) + '|--------|--------'));
  for (const f of included) {
    console.log(`  ${chalk.yellow(f.padEnd(col1Width))} | ${chalk.green('  +1  ')} | ${chalk.gray('  -0  ')}`);
  }
  console.log(chalk.cyan('─'.repeat(60)));

  // 4. Confirm before push
  const proceed = await confirm('Proceed with dev-push?');
  if (!proceed) {
    console.log(chalk.yellow('Dev-push cancelled.'));
    process.exit(0);
  }

  // 5. Create branch and copy files
  const branchName = `sps-cli-dev-push-${Date.now()}`;
  gitCheckoutNewBranch(branchName, pushDir);

  for (const file of included) {
    const srcPath = path.join(localPath, file);
    const destPath = path.join(pushDir, file);

    if (fs.existsSync(srcPath) && fs.statSync(srcPath).isFile()) {
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(srcPath, destPath);
    }
  }

  // 6. Stage, commit, and push
  gitAdd(included, pushDir);
  const commitMessage = message || `sps-cli: dev-push\n\nFiles: ${included.join(', ')}`;
  gitCommit(commitMessage, pushDir);
  gitPush(branchName, pushDir);

  // 7. Create PR
  const prUrl = await createPR(
    SPS_CLI_REPO,
    `sps-cli: ${commitMessage.split('\n')[0]}`,
    `Dev-push via sps-cli\n\nFiles changed: ${included.length}\n\n${included.map(f => `- ${f}`).join('\n')}`,
    branchName
  );

  return prUrl;
}

export async function update(localPath: string): Promise<void> {
  const pullDir = path.join('.sps-cli', 'tmp', 'update', SPS_CLI_REPO.replace(/[\/\\]/g, '_'));
  const remoteUrl = `https://github.com/${SPS_CLI_REPO}.git`;

  // 1. Clone or pull remote sps-cli
  cloneOrPull(remoteUrl, pullDir);

  // 2. Get manifest and files from remote
  const manifest = loadManifest(pullDir);
  const included = await getIncludedFiles(pullDir, manifest);

  if (included.length === 0) {
    console.log(chalk.green('✓ Already up to date — no changes to pull'));
    return;
  }

  // 3. Show update preview
  console.log(chalk.cyan('─'.repeat(60)));
  console.log(chalk.cyan(' UPDATE PREVIEW '));
  console.log(chalk.cyan('─'.repeat(60)));
  console.log(chalk.red(`Files to overwrite: ${included.length}`));
  console.log(chalk.cyan('─'.repeat(60)));
  const col1Width = 65;
  console.log(chalk.gray('  File' + ' '.repeat(col1Width - 4) + '|    +    |    -'));
  console.log(chalk.gray('  ' + '-'.repeat(col1Width) + '|--------|--------'));
  for (const f of included) {
    console.log(`  ${chalk.yellow(f.padEnd(col1Width))} | ${chalk.green('  +1  ')} | ${chalk.gray('  -0  ')}`);
  }
  console.log(chalk.cyan('─'.repeat(60)));

  // 4. Confirm before overwrite
  const proceed = await confirm('Proceed with update?');
  if (!proceed) {
    console.log(chalk.yellow('Update cancelled.'));
    return;
  }

  // 5. Copy files from pullDir to localPath
  for (const file of included) {
    const srcPath = path.join(pullDir, file);
    const destPath = path.join(localPath, file);

    if (fs.existsSync(srcPath)) {
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(srcPath, destPath);
    }
  }

  console.log(chalk.green(`✓ Updated sps-cli at ${localPath}`));
}

export async function sync(repo: string, localPath: string): Promise<void> {
  await pull(repo, localPath);
  await push(repo, localPath);
}
