import { normalizeLanguageIdentifier } from './languageIcon'

export interface RegisterHighlightOptions {
  themes?: string[]
  langs?: string[]
}

export interface ShikiRendererOptions {
  theme?: string
  themes?: string[]
  langs?: string[]
}

// Shiki ids are not display/icon ids; keep this map limited to safe Shiki aliases.
const SHIKI_LANGUAGE_ALIAS_MAP: Record<string, string> = {
  'plain': 'plaintext',
  'text': 'plaintext',
  'txt': 'plaintext',

  'js': 'javascript',
  'mjs': 'javascript',
  'cjs': 'javascript',

  'ts': 'typescript',
  'mts': 'typescript',
  'cts': 'typescript',

  'py': 'python',
  'rb': 'ruby',
  'rs': 'rust',
  'kt': 'kotlin',
  'kts': 'kotlin',
  'md': 'markdown',
  'yml': 'yaml',

  'sh': 'shellscript',
  'bash': 'shellscript',
  'zsh': 'shellscript',
  'shell': 'shellscript',
  'shellscript': 'shellscript',

  'ps': 'powershell',
  'ps1': 'powershell',
  'pwsh': 'powershell',

  'c++': 'cpp',
  'c#': 'csharp',
  'cs': 'csharp',

  'objc': 'objective-c',
  'objectivec': 'objective-c',
  'objective-c': 'objective-c',
  'objectivecpp': 'objective-cpp',
  'objective-c++': 'objective-cpp',
  'objective-cpp': 'objective-cpp',
}

export function getLanguageBaseToken(rawLang?: string | null) {
  const trimmed = String(rawLang ?? '').trim()
  if (!trimmed)
    return ''

  const [firstToken = ''] = trimmed.split(/\s+/)
  return firstToken.split(':')[0]?.trim().toLowerCase() ?? ''
}

export function normalizeDisplayLanguage(rawLang?: string | null) {
  return normalizeLanguageIdentifier(getLanguageBaseToken(rawLang))
}

export function normalizeShikiLanguage(rawLang?: string | null) {
  const token = getLanguageBaseToken(rawLang)
  return SHIKI_LANGUAGE_ALIAS_MAP[token] ?? token
}

export function getShikiLanguageMatchKey(rawLang?: string | null) {
  return normalizeShikiLanguage(rawLang)
}

export function getShikiLangs(langs?: readonly string[]) {
  const normalized = Array.isArray(langs)
    ? langs.map(lang => normalizeShikiLanguage(lang)).filter(Boolean)
    : []

  return normalized.length > 0
    ? Array.from(new Set(normalized))
    : undefined
}

function getShikiThemes(themes?: readonly unknown[]) {
  if (!Array.isArray(themes))
    return undefined

  const normalized = themes
    .map(theme => typeof theme === 'string' ? theme.trim() : '')
    .filter(Boolean)

  return normalized.length > 0
    ? Array.from(new Set(normalized))
    : undefined
}

export function getHighlightRegistrationKey(themes?: readonly unknown[], langs?: readonly string[]) {
  const themesKey = getShikiThemes(themes)?.join('\u0000') ?? ''

  const langsKey = getShikiLangs(langs)
    ?.map(lang => getShikiLanguageMatchKey(lang))
    .sort()
    .join('\u0000') ?? ''

  return `${themesKey}\u0000\u0000${langsKey}`
}

export function getRegisterHighlightOptions(themes?: readonly unknown[], langs?: readonly string[]): RegisterHighlightOptions {
  const opts: RegisterHighlightOptions = {}

  const shikiThemes = getShikiThemes(themes)
  if (shikiThemes?.length)
    opts.themes = shikiThemes

  const shikiLangs = getShikiLangs(langs)
  if (shikiLangs?.length)
    opts.langs = shikiLangs

  return opts
}

export function createRegisteredHighlightLanguages(langs?: readonly string[]) {
  const shikiLangs = getShikiLangs(langs)
  if (!shikiLangs?.length)
    return undefined

  return new Set(
    shikiLangs.map(lang => getShikiLanguageMatchKey(lang)),
  )
}
