import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { pull, push, sync } from './sync';
import { diff } from './diff';
import { status } from './status';
import { doctor } from '../doctor/doctor';

export function registerCommands(program: Command): void {
  program
    .command('pull <repo>')
    .description('Pull remote changes to local')
    .option('-l, --local <path>', 'Local path', '..')
    .action(async (repo, options) => {
      try {
        const localPath = path.resolve(options.local, repo);
        await pull(repo, localPath);
      } catch (error) {
        console.error(chalk.red(`✗ Pull failed: ${error}`));
        process.exit(1);
      }
    });

  program
    .command('push <repo>')
    .description('Push local changes to remote via PR')
    .option('-l, --local <path>', 'Local path', '..')
    .option('-m, --message <msg>', 'Commit/PR message')
    .action(async (repo, options) => {
      try {
        const localPath = `${options.local}/${repo}`;
        const prUrl = await push(repo, localPath, options.message);
        console.log(chalk.green(`✓ Created PR: ${prUrl}`));
      } catch (error) {
        console.error(chalk.red(`✗ Push failed: ${error}`));
        process.exit(1);
      }
    });

  program
    .command('sync <repo>')
    .description('Bidirectional sync (pull then push)')
    .option('-l, --local <path>', 'Local path', '..')
    .action(async (repo, options) => {
      try {
        const localPath = `${options.local}/${repo}`;
        await sync(repo, localPath);
        console.log(chalk.green(`✓ Synced ${repo}`));
      } catch (error) {
        console.error(chalk.red(`✗ Sync failed: ${error}`));
        process.exit(1);
      }
    });

  program
    .command('diff <repo>')
    .description('Show differences between local and remote')
    .option('-l, --local <path>', 'Local path', '..')
    .action(async (repo, options) => {
      try {
        const localPath = `${options.local}/${repo}`;
        const result = await diff(repo, localPath);

        console.log(chalk.cyan('─'.repeat(60)));
        console.log(chalk.cyan(' DIFF RESULTS '));
        console.log(chalk.cyan('─'.repeat(60)));
        console.log(chalk.green(`Will push: ${result.included.length} files`));
        console.log(chalk.cyan('─'.repeat(60)));
        if (result.included.length > 0) {
          console.log(chalk.green('Files to push:'));
          const col1Width = 70;
          console.log(chalk.gray('  File' + ' '.repeat(col1Width - 4) + '|    +    |    -'));
          console.log(chalk.gray('  ' + '-'.repeat(col1Width) + '|--------|--------'));
          result.included.forEach(f => {
            const name = f.file.length > col1Width ? f.file.slice(0, col1Width - 3) + '...' : f.file;
            const addStr = chalk.green(`+${f.additions}`);
            const delStr = f.deletions > 0 ? chalk.red(`-${f.deletions}`) : chalk.gray(`-${f.deletions}`);
            console.log(`  ${chalk.yellow(name.padEnd(col1Width))} | ${addStr.padStart(7)} | ${delStr.padStart(7)}`);
          });
        } else {
          console.log(chalk.gray('No files to push'));
        }
        console.log(chalk.cyan('─'.repeat(60)));
      } catch (error) {
        console.error(chalk.red(`✗ Diff failed: ${error}`));
        process.exit(1);
      }
    });

  program
    .command('status <repo>')
    .description('Show sync status of tracked files')
    .option('-l, --local <path>', 'Local path', '..')
    .action(async (repo, options) => {
      try {
        const localPath = `${options.local}/${repo}`;
        const result = await status(repo, localPath);
        console.log(chalk.cyan('Tracked files:'), result.tracked);
        console.log(chalk.cyan('Modified files:'), result.modified);
        console.log(chalk.cyan('Total:'), result.total);
      } catch (error) {
        console.error(chalk.red(`✗ Status failed: ${error}`));
        process.exit(1);
      }
    });

  program
    .command('doctor')
    .description('Check environment readiness for sync operations')
    .option('-l, --local <path>', 'Local path (manifest directory)', '..')
    .action(async (options) => {
      try {
        const localPath = path.resolve(options.local);
        const results = await doctor(localPath);
        console.log(chalk.cyan('─'.repeat(60)));
        let errors = 0;
        let warnings = 0;

        for (const r of results) {
          if (r.status === 'ok') {
            console.log(`${chalk.green('[OK]')}  ${chalk.bold(r.name.padEnd(20))} ${r.message}`);
          } else if (r.status === 'warn') {
            console.log(`${chalk.yellow('[WARN]')} ${chalk.bold(r.name.padEnd(20))} ${r.message}`);
            warnings++;
          } else {
            console.log(`${chalk.red('[FAIL]')} ${chalk.bold(r.name.padEnd(20))} ${r.message}`);
            errors++;
          }
        }

        console.log(chalk.cyan('─'.repeat(60)));
        if (errors === 0 && warnings === 0) {
          console.log(chalk.green(`✓ All checks passed`));
        } else {
          console.log(`${errors} error${errors !== 1 ? 's' : ''}, ${warnings} warning${warnings !== 1 ? 's' : ''}`);
        }
        console.log(chalk.gray('Run with: pull, push, diff, sync, status, doctor'));

        process.exit(errors > 0 ? 1 : 0);
      } catch (error) {
        console.error(chalk.red(`✗ Doctor failed: ${error}`));
        process.exit(1);
      }
    });
}
