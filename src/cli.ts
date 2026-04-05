#!/usr/bin/env node
import { Command } from 'commander';
import { registerCommands } from './sync-code/cli-handlers';

export function run() {
  const program = new Command();

  program
    .name('sps-cli')
    .description('VCS-agnostic sync CLI with manifest-driven bidirectional sync')
    .version('0.0.1');

  registerCommands(program);

  program.parse(process.argv);
}

// Run if executed directly
run();
