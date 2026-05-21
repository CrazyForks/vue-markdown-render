const FILENAMEISH_EXTENSION_RE = /\.([a-z0-9]{1,10})$/i
const FILENAMEISH_SEGMENT_RE = /[_()[\]{}<>]/u
const URL_PREFIX_HINT_RE = /^(?:https?:\/\/|ftp:\/\/|mailto:|www\.)/i
const URL_QUERY_OR_AUTH_HINT_RE = /[?#@]/u
const PATH_SEPARATOR_RE = /[\\/]/u
const DOMAINISH_TEXT_RE = /^[\p{L}\p{N}./\\-]+$/u
const DOMAIN_LABEL_RE = /^[A-Za-z0-9-]{1,63}$/u
const PUNYCODE_TLD_RE = /^xn--[a-z0-9-]{2,59}$/i
const MARKET_TICKER_SYMBOL_RE = /^(?:[A-Z]{1,6}|\d{1,8})$/u
const MARKET_TICKER_CONTEXT_SYMBOL_RE = /^(?=.{1,12}$)[A-Z0-9]+(?:-[A-Z0-9]+)?$/iu
const FILENAME_CONTEXT_RE = /文件名\s*[:：]?|文件\s*[:：]?|附件\s*[:：]?|档案\s*[:：]?|檔案\s*[:：]?|\bfile\s*name\b\s*[:：]?|\battachments?\b\s*[:：]?|\bfiles?\b\s*[:：]?/iu
const MARKET_TICKER_CONTEXT_RE = /股票代码|股票代碼|证券代码|證券代碼|代码|代碼|交易所|后缀|後綴|市场|市場|\btickers?\b|\bsymbols?\b|\bexchanges?\b/iu
const AMBIGUOUS_BARE_DOMAIN_EXTENSIONS = new Set([
  'ai',
  'md',
  'py',
  'rs',
  'sh',
  'zip',
])
const MARKET_TICKER_SUFFIXES = new Set([
  'as',
  'bj',
  'de',
  'hk',
  'l',
  'ln',
  'ny',
  'pa',
  'sh',
  'ss',
  'sz',
  't',
  'us',
])
const MARKET_TICKER_CONTEXT_SUFFIXES = new Set([
  ...MARKET_TICKER_SUFFIXES,
  'ax',
  'ks',
  'to',
  'tw',
])
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

export interface LinkifyDemotionContext {
  filename?: boolean
  marketTicker?: boolean
}

function isValidDomainLabel(label: string) {
  return DOMAIN_LABEL_RE.test(label)
    && !label.startsWith('-')
    && !label.endsWith('-')
}

function isPlausibleBareDomain(text: string) {
  const labels = text.split('.')
  if (labels.length < 2)
    return false

  const tld = labels[labels.length - 1]?.toLowerCase() ?? ''
  if (!(isValidDomainLabel(tld) || PUNYCODE_TLD_RE.test(tld)))
    return false

  return labels.every(isValidDomainLabel)
}

function hasNonAsciiText(input: string) {
  return Array.from(input).some(char => char.charCodeAt(0) > 0x7F)
}

function getHrefAuthority(href: string) {
  return href.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/, 1)[0] ?? ''
}

function hasPunycodeAuthorityLabel(authority: string) {
  return authority.split('.').some(label => label.toLowerCase().startsWith('xn--'))
}

export function isDecodedFromRawPunycode(linkText: string, href: string, raw?: string) {
  const authority = getHrefAuthority(href)
  return hasNonAsciiText(linkText)
    && hasPunycodeAuthorityLabel(authority)
    && String(raw ?? '').toLowerCase().includes(authority.toLowerCase())
}

export function inferLinkifyDemotionContext(contextText?: string): LinkifyDemotionContext {
  const text = String(contextText ?? '')
  return {
    filename: FILENAME_CONTEXT_RE.test(text),
    marketTicker: MARKET_TICKER_CONTEXT_RE.test(text),
  }
}

function hasDomainAuthorityPrefix(text: string) {
  const prefix = text.split(/[\\/]/)[0] ?? ''
  return isPlausibleBareDomain(prefix)
}

function isUppercaseFilenameSegment(segment: string) {
  const lettersOnly = segment.replace(/[^a-z]/gi, '')
  return lettersOnly.length >= 2 && lettersOnly === lettersOnly.toUpperCase()
}

function hasStrongFilenameSignals(linkText: string) {
  if (FILENAMEISH_SEGMENT_RE.test(linkText))
    return true

  if (!DOMAINISH_TEXT_RE.test(linkText))
    return true

  if (PATH_SEPARATOR_RE.test(linkText))
    return !hasDomainAuthorityPrefix(linkText)

  const extensionless = linkText.replace(FILENAMEISH_EXTENSION_RE, '')
  if (hasNonAsciiText(extensionless))
    return true

  const filenameLikeSegments = extensionless.split('.').filter(Boolean)
  return filenameLikeSegments.some(isUppercaseFilenameSegment)
}

function isMarketTickerLikeText(linkText: string, extension: string, hasMarketTickerContext: boolean) {
  const suffixes = hasMarketTickerContext ? MARKET_TICKER_CONTEXT_SUFFIXES : MARKET_TICKER_SUFFIXES
  if (!suffixes.has(extension))
    return false

  const symbol = linkText.slice(0, -(extension.length + 1))
  if (symbol === '')
    return linkText.startsWith('.')

  const symbolRe = hasMarketTickerContext ? MARKET_TICKER_CONTEXT_SYMBOL_RE : MARKET_TICKER_SYMBOL_RE
  return symbolRe.test(symbol)
}

export function shouldDemoteFilenameLikeLinkify(linkText: string, context: LinkifyDemotionContext = {}) {
  if (!linkText || URL_PREFIX_HINT_RE.test(linkText) || URL_QUERY_OR_AUTH_HINT_RE.test(linkText))
    return false

  const extensionMatch = linkText.match(FILENAMEISH_EXTENSION_RE)
  if (!extensionMatch)
    return false

  const extension = String(extensionMatch[1] ?? '').toLowerCase()
  if (isMarketTickerLikeText(linkText, extension, context.marketTicker === true))
    return true

  if (!FILENAMEISH_LINK_EXTENSIONS.has(extension))
    return false

  // Extensions like `.ai` and `.md` can be both real bare-domain TLDs and
  // common filenames. Keep those linkified unless we also see stronger
  // filename-only signals such as path separators, underscores, brackets, or
  // all-uppercase filename segments like `README`.
  if (!AMBIGUOUS_BARE_DOMAIN_EXTENSIONS.has(extension))
    return true

  if (context.filename)
    return true

  return hasStrongFilenameSignals(linkText)
}
