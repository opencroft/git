import { defineExtension } from '@ext/host'

import { GitAppForm } from './app-form'
import { GitAppView } from './app-view'

export default defineExtension({
  manifest: {
    id: 'local/git',
    name: 'Git',
    version: '0.5.0',
    description: 'Git App — clone repositories (bare), manage worktrees, and review and commit in a full-page git client over a terminal.',
  },
  provides: {
    apps: [
      {
        slug: 'git',
        title: 'Git',
        description: 'Browse a workspace of git repositories and review, commit and manage worktrees in a full-page git client.',
        icon: 'GitBranch',
        component: GitAppView,
        form: GitAppForm,
      },
    ],
  },
})
