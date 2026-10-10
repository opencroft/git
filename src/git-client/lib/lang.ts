const EXT_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  md: 'markdown',
  mdx: 'markdown',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  sql: 'sql',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  lua: 'lua',
  r: 'r',
  dart: 'dart',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  gitignore: 'plaintext',
  env: 'plaintext',
  lock: 'json',
  map: 'json',
}

const NAME_MAP: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  '.gitignore': 'plaintext',
  '.env': 'plaintext',
  '.eslintrc': 'json',
  '.prettierrc': 'json',
  '.babelrc': 'json',
  'tsconfig.json': 'json',
  'package.json': 'json',
  'composer.json': 'json',
  license: 'plaintext',
  readme: 'markdown',
}

export function langFromPath(path: string): string {
  const basename = path.split('/').pop() ?? path
  const lower = basename.toLowerCase()

  if (NAME_MAP[lower]) {
    return NAME_MAP[lower]
  }

  const dot = lower.lastIndexOf('.')
  if (dot !== -1) {
    const ext = lower.slice(dot + 1)
    if (EXT_MAP[ext]) {
      return EXT_MAP[ext]
    }
  }

  return 'plaintext'
}
