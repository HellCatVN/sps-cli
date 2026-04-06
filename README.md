# sps-cli

VCS-agnostic sync CLI with manifest-driven bidirectional sync.

## Features

- **Manifest-driven**: Each repo's `manifest.json` controls which files are synced via glob patterns
- **Bidirectional sync**: Pull (remote → local) and Push (local → remote via PR)
- **VCS agnostic**: Supports GitHub (`gh` CLI) and GitLab (`glab` CLI)
- **Filtered sync**: Only syncs files matching `include` patterns, excluding `exclude` patterns

## Installation

```bash
npm install -g
```

Or run directly:

```bash
npx ts-node src/index.ts <command>
```

## Configuration

### 1. Create `.env` file

```env
# Provider: github | gitlab
VCS_PROVIDER=github

# GitHub token (repo URLs are configured in repos.json)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx

# GitLab (future)
GITLAB_TOKEN=glpat-xxxxxxxxxxxxx

# Sync behavior
VCS_CONFLICT_STRATEGY=local_wins
VCS_PULL_DELETE_LOCAL=true
VCS_PR_DRAFT=false
```

### 2. Configure repos in `repos.json`

```json
{
  "node-api": "https://github.com/HellCatVN/node-api.git",
  "web-frontend": "https://github.com/HellCatVN/web-frontend.git"
}
```

## Manifest Format

Each repo must have a `manifest.json`:

```json
{
  "name": "my-repo",
  "version": "0.0.1",
  "sync": {
    "include": [
      "src/**/*.ts",
      "*.json",
      "README.md"
    ],
    "exclude": [
      "src/**/*.test.ts",
      "node_modules/**",
      "dist/**",
      ".env"
    ]
  }
}
```

## Commands

### `pull <repo>`
Pull remote changes to local.

```bash
sps-cli pull node-api
sps-cli pull node-api --local ./custom-path
```

### `push <repo>`
Push local changes to remote via PR.

```bash
sps-cli push node-api
sps-cli push node-api --message "Update feature X"
```

### `sync <repo>`
Bidirectional sync (pull then push).

```bash
sps-cli sync node-api
```

### `diff <repo>`
Show differences between local and remote.

```bash
sps-cli diff node-api
```

### `status <repo>`
Show sync status of tracked files.

```bash
sps-cli status node-api
```

## Prerequisites

- `gh` CLI installed and authenticated (for GitHub)
- `glab` CLI installed and authenticated (for GitLab, future)
- Node.js 18+

## License

MIT
