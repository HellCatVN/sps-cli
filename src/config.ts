import path from 'path';
import fs from 'fs';

const configPath = path.resolve(process.cwd(), 'sgs.config.js');

if (!fs.existsSync(configPath)) {
  throw new Error(
    `sgs.config.js not found in ${process.cwd()}. ` +
    `Please create a sgs.config.js file in your project root.`
  );
}

export const config: {
  provider?: string;
  github?: { token: string };
  gitlab?: { token: string };
  conflictStrategy?: string;
  pullDeleteLocal?: boolean;
  prDraft?: boolean;
} = require(configPath);

export function validateConfig(): void {
  if (!config.github?.token) {
    throw new Error('github.token is required in sgs.config.js');
  }
}
