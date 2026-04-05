// sgs.config.js - Sync CLI configuration
// Copy this file to your project root and fill in your values

module.exports = {
  provider: 'github', // 'github' | 'gitlab'

  github: {
    token: 'ghp_xxxxxxxxxxxxx', // GitHub personal access token
  },

  gitlab: {
    token: 'glpat-xxxxxxxxxxxxx', // GitLab personal access token
  },

  // Sync behavior
  conflictStrategy: 'local_wins', // 'local_wins' | 'remote_wins'
  pullDeleteLocal: true,          // Delete local branches on pull
  prDraft: false,                  // Create draft PRs
};
