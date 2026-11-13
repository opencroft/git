import { cn } from 'cn'
import {
  File,
  FileArchive,
  FileAudio,
  FileBox,
  FileCode,
  FileCog,
  FileDigit,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideoCamera,
  Folder,
  type LucideIcon,
} from 'lucide-react'

export type FileKind =
  | 'folder'
  | 'code'
  | 'image'
  | 'text'
  | 'spreadsheet'
  | 'video'
  | 'audio'
  | 'model'
  | 'config'
  | 'archive'
  | 'binary'
  | 'file'

const KIND_ICON: Record<FileKind, LucideIcon> = {
  folder: Folder,
  code: FileCode,
  image: FileImage,
  text: FileText,
  spreadsheet: FileSpreadsheet,
  video: FileVideoCamera,
  audio: FileAudio,
  model: FileBox,
  config: FileCog,
  archive: FileArchive,
  binary: FileDigit,
  file: File,
}

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  folder: 'Folder',
  code: 'Code',
  image: 'Image',
  text: 'Text',
  spreadsheet: 'Spreadsheet',
  video: 'Video',
  audio: 'Audio',
  model: '3D model',
  config: 'Config',
  archive: 'Archive',
  binary: 'Binary',
  file: 'File',
}

const EXTENSION_KIND: Record<string, FileKind> = {
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
  exe: 'binary',
  dll: 'binary',
  so: 'binary',
  dylib: 'binary',
  bin: 'binary',
  o: 'binary',
  a: 'binary',
  wasm: 'binary',
  class: 'binary',
  pyc: 'binary',
  msi: 'binary',
  deb: 'binary',
  rpm: 'binary',
  apk: 'binary',
  dmg: 'binary',
  iso: 'binary',
  img: 'binary',
  elf: 'binary',
}

const NAME_KIND: Record<string, FileKind> = {
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

// The kind of a file from its name or path: a known whole name first
// (Dockerfile, .gitignore), then a `.env.<stage>` file, then the extension.
// Anything else is a plain `file`. Names are matched case-insensitively.
export function fileKind(name: string, directory = false): FileKind {
  if (directory) return 'folder'
  const basename = (name.split('/').pop() ?? name).toLowerCase()
  const byName = NAME_KIND[basename]
  if (byName) return byName
  if (basename.startsWith('.env.')) return 'config'
  const dot = basename.lastIndexOf('.')
  if (dot > 0) {
    const byExtension = EXTENSION_KIND[basename.slice(dot + 1)]
    if (byExtension) return byExtension
  }
  return 'file'
}

const SIZE_CLASS = {
  sm: 'size-4',
  lg: 'size-6',
} as const

interface FileTypeIconProps {
  // A file name or a path; only the last segment is read.
  name: string
  directory?: boolean
  size?: keyof typeof SIZE_CLASS
  className?: string
}

// The icon for one entry's kind (see fileKind). Decorative: the name beside
// it is the accessible text.
export function FileTypeIcon({ name, directory = false, size = 'sm', className }: FileTypeIconProps) {
  const Icon = KIND_ICON[fileKind(name, directory)]
  return <Icon className={cn(SIZE_CLASS[size], 'shrink-0 text-muted-foreground', className)} aria-hidden />
}
