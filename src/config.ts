import path from 'path';
import fs from 'fs';

type Config = {
  provider?: string;
  github?: { token: string };
  gitlab?: { token: string };
  conflictStrategy?: string;
  pullDeleteLocal?: boolean;
  prDraft?: boolean;
};

let _config: Config | null = null;

function loadConfig(): Config {
  if (_config !== null) return _config;
  const configPath = path.resolve(process.cwd(), 'sgs.config.js');
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `sgs.config.js not found in ${process.cwd()}. ` +
      `Please create a sgs.config.js file in your project root.`
    );
  }
  _config = require(configPath) as Config;
  return _config;
}

export const config: Config = {
  get provider() { return loadConfig().provider; },
  get github() { return loadConfig().github; },
  get gitlab() { return loadConfig().gitlab; },
  get conflictStrategy() { return loadConfig().conflictStrategy; },
  get pullDeleteLocal() { return loadConfig().pullDeleteLocal; },
  get prDraft() { return loadConfig().prDraft; },
};

export function validateConfig(): void {
  const cfg = loadConfig();
  if (!cfg.github?.token) {
    throw new Error('github.token is required in sgs.config.js');
  }
}