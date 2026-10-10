import { defineExtension } from '@opencroft/client/extension'

import { GitAppForm } from './app-form'
import { GitAppView } from './app-view'

export default defineExtension({
  manifest: {},
  provides: {
    apps: [
      {
        type: 'git',
        title: 'Git',
        description:
          'Browse a workspace of git repositories and review, commit and manage worktrees in a full-page git client.',
        icon: 'GitBranch',
        component: GitAppView,
        form: GitAppForm,
      },
    ],
  },
})
