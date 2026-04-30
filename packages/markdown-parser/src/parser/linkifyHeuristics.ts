const WORD_LIKE_CHAR_RE = /[\p{L}\p{N}]/u
const FILENAMEISH_EXTENSION_RE = /\.([a-z0-9]{1,10})$/i
const FILENAMEISH_SIGNAL_RE = /[A-Z_()[\]{}<>]/u
const URL_PREFIX_HINT_RE = /^(?:https?:\/\/|ftp:\/\/|mailto:|www\.)/i
const URL_PATH_HINT_RE = /[/?#@]/u
const FILENAMEISH_LINK_EXTENSIONS = new Set([
  '7z',
  'ai',
  'astro',
  'avi',
  'bash',
  'bz2',
  'c',
  'cjs',
  'cpp',
  'cs',
  'csv',
  'doc',
  'docx',
  'fish',
  'flac',
  'gif',
  'go',
  'gz',
  'h',
  'hpp',
  'html',
  'java',
  'jpeg',
  'jpg',
  'js',
  'json',
  'jsx',
  'kt',
  'md',
  'mdx',
  'mjs',
  'mov',
  'mp3',
  'mp4',
  'pdf',
  'php',
  'png',
  'ppt',
  'pptx',
  'ps1',
  'py',
  'rar',
  'rb',
  'rs',
  'sh',
  'sql',
  'svg',
  'swift',
  'svelte',
  'tar',
  'tgz',
  'toml',
  'ts',
  'tsx',
  'txt',
  'vue',
  'wav',
  'webp',
  'xls',
  'xlsx',
  'xml',
  'yaml',
  'yml',
  'zip',
  'zsh',
])

function isWordLikeChar(ch?: string) {
  return !!ch && WORD_LIKE_CHAR_RE.test(ch)
}

function hasNonAsciiChar(text: string) {
  for (const char of text) {
    if ((char.codePointAt(0) ?? 0) > 0x7F)
      return true
  }
  return false
}

export function shouldDemoteFilenameLikeLinkify(linkText: string, previousVisibleChar = '') {
  if (!linkText || URL_PREFIX_HINT_RE.test(linkText) || URL_PATH_HINT_RE.test(linkText))
    return false

  const extensionMatch = linkText.match(FILENAMEISH_EXTENSION_RE)
  if (!extensionMatch)
    return false

  const extension = String(extensionMatch[1] ?? '').toLowerCase()
  if (!FILENAMEISH_LINK_EXTENSIONS.has(extension))
    return false

  return (
    isWordLikeChar(previousVisibleChar)
    || hasNonAsciiChar(linkText)
    || FILENAMEISH_SIGNAL_RE.test(linkText)
  )
}
