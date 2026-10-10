import {
  File,
  FileArchive,
  FileAudio,
  FileBox,
  FileCode,
  FileCog,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideoCamera,
  type LucideIcon,
} from 'lucide-react'

type Category = 'code' | 'image' | 'text' | 'spreadsheet' | 'video' | 'audio' | 'model' | 'config' | 'archive'

const CATEGORY_ICON: Record<Category, LucideIcon> = {
  code: FileCode,
  image: FileImage,
  text: FileText,
  spreadsheet: FileSpreadsheet,
  video: FileVideoCamera,
  audio: FileAudio,
  model: FileBox,
  config: FileCog,
  archive: FileArchive,
}

const EXT_CATEGORY: Record<string, Category> = {
  ts: 'code',
  tsx: 'code',
  js: 'code',
  jsx: 'code',
  mjs: 'code',
  cjs: 'code',
  py: 'code',
  rb: 'code',
  go: 'code',
  rs: 'code',
  java: 'code',
  kt: 'code',
  swift: 'code',
  c: 'code',
  h: 'code',
  cpp: 'code',
  hpp: 'code',
  cc: 'code',
  cs: 'code',
  php: 'code',
  lua: 'code',
  r: 'code',
  dart: 'code',
  scala: 'code',
  sh: 'code',
  bash: 'code',
  zsh: 'code',
  sql: 'code',
  html: 'code',
  htm: 'code',
  css: 'code',
  scss: 'code',
  less: 'code',
  xml: 'code',
  vue: 'code',
  svelte: 'code',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  svg: 'image',
  webp: 'image',
  bmp: 'image',
  ico: 'image',
  tiff: 'image',
  avif: 'image',
  heic: 'image',
  txt: 'text',
  md: 'text',
  mdx: 'text',
  rtf: 'text',
  log: 'text',
  rst: 'text',
  adoc: 'text',
  tex: 'text',
  csv: 'spreadsheet',
  tsv: 'spreadsheet',
  xls: 'spreadsheet',
  xlsx: 'spreadsheet',
  ods: 'spreadsheet',
  mp4: 'video',
  mov: 'video',
  avi: 'video',
  mkv: 'video',
  webm: 'video',
  flv: 'video',
  wmv: 'video',
  m4v: 'video',
  mp3: 'audio',
  wav: 'audio',
  flac: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  aac: 'audio',
  obj: 'model',
  fbx: 'model',
  gltf: 'model',
  glb: 'model',
  stl: 'model',
  blend: 'model',
  dae: 'model',
  '3ds': 'model',
  ply: 'model',
  usdz: 'model',
  json: 'config',
  jsonc: 'config',
  yaml: 'config',
  yml: 'config',
  toml: 'config',
  ini: 'config',
  conf: 'config',
  cfg: 'config',
  env: 'config',
  properties: 'config',
  lock: 'config',
  zip: 'archive',
  tar: 'archive',
  gz: 'archive',
  tgz: 'archive',
  rar: 'archive',
  '7z': 'archive',
  bz2: 'archive',
  xz: 'archive',
}

const NAME_CATEGORY: Record<string, Category> = {
  dockerfile: 'code',
  makefile: 'code',
  readme: 'text',
  license: 'text',
  '.gitignore': 'config',
  '.gitattributes': 'config',
  '.editorconfig': 'config',
  '.env': 'config',
  '.npmrc': 'config',
  '.prettierrc': 'config',
  '.eslintrc': 'config',
}

function categoryFromPath(path: string): Category {
  const basename = path.split('/').pop() ?? path
  const lower = basename.toLowerCase()

  if (NAME_CATEGORY[lower]) {
    return NAME_CATEGORY[lower]
  }

  const dot = lower.lastIndexOf('.')
  if (dot > 0) {
    const ext = lower.slice(dot + 1)
    if (EXT_CATEGORY[ext]) {
      return EXT_CATEGORY[ext]
    }
  }

  return 'code'
}

export function typeIcon(path: string) {
  const Icon = CATEGORY_ICON[categoryFromPath(path)] ?? File
  return <Icon className='size-4 shrink-0 text-muted-foreground' />
}
