export interface RegisterHighlightOptions {
  themes?: string[]
  langs?: string[]
}

export interface ShikiRendererOptions {
  theme?: string
  themes?: string[]
  langs?: string[]
}

export type RegisterHighlightFn
  = (opts?: RegisterHighlightOptions) => Promise<unknown> | unknown

type SharedHighlightRegistrationStatus = 'ready'

type HighlightRegistrationTaskMap = Map<
  string,
  Promise<SharedHighlightRegistrationStatus>
>

interface HighlightRegistrationState {
  inFlight: HighlightRegistrationTaskMap
  completed: Set<string>
  tail: Promise<unknown>
}

const sharedHighlightRegistrationStates = new WeakMap<
  RegisterHighlightFn,
  HighlightRegistrationState
>()

function getHighlightRegistrationState(registerHighlight: RegisterHighlightFn) {
  let state = sharedHighlightRegistrationStates.get(registerHighlight)
  if (!state) {
    state = {
      inFlight: new Map(),
      completed: new Set(),
      tail: Promise.resolve(),
    }
    sharedHighlightRegistrationStates.set(registerHighlight, state)
  }
  return state
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

  'golang': 'go',

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

export function normalizeShikiLanguage(rawLang?: string | null) {
  const token = getLanguageBaseToken(rawLang)
  return SHIKI_LANGUAGE_ALIAS_MAP[token] ?? token
}

export function getShikiLanguageMatchKey(rawLang?: string | null) {
  return normalizeShikiLanguage(rawLang)
}

export function getShikiLangs(langs?: readonly unknown[]) {
  if (!Array.isArray(langs))
    return undefined

  const normalized = langs
    .filter((lang): lang is string => typeof lang === 'string')
    .map(lang => normalizeShikiLanguage(lang))
    .filter(Boolean)

  const unique = Array.from(new Set(normalized)).sort()

  return unique.length > 0 ? unique : undefined
}

export function getShikiThemes(themes?: readonly unknown[]) {
  if (!Array.isArray(themes))
    return undefined

  const unique: string[] = []
  const seen = new Set<string>()

  for (const theme of themes) {
    if (typeof theme !== 'string')
      continue

    const normalized = theme.trim()
    if (!normalized || seen.has(normalized))
      continue

    seen.add(normalized)
    unique.push(normalized)
  }

  return unique.length > 0 ? unique : undefined
}

function getShikiThemesKey(themes?: readonly unknown[]) {
  return getShikiThemes(themes)?.join('\u0000') ?? ''
}

export function getShikiRendererOptions(
  themes?: readonly unknown[],
  langs?: readonly unknown[],
): Pick<ShikiRendererOptions, 'themes' | 'langs'> {
  return getRegisterHighlightOptions(themes, langs)
}

export function getRegisterHighlightOptions(
  themes?: readonly unknown[],
  langs?: readonly unknown[],
): RegisterHighlightOptions {
  const shikiThemes = getShikiThemes(themes)
  const shikiLangs = getShikiLangs(langs)

  return {
    ...(shikiThemes?.length ? { themes: shikiThemes } : {}),
    ...(shikiLangs?.length ? { langs: shikiLangs } : {}),
  }
}

export function getHighlightRegistrationKey(themes?: readonly unknown[], langs?: readonly unknown[]) {
  const themesKey = getShikiThemesKey(themes)
  const langsKey = getShikiLangs(langs)?.join('\u0000') ?? ''

  return `${themesKey}\u0000\u0000${langsKey}`
}

export async function registerHighlightOnce(
  registerHighlight: RegisterHighlightFn | undefined,
  opts: RegisterHighlightOptions,
  key = getHighlightRegistrationKey(opts.themes, opts.langs),
): Promise<SharedHighlightRegistrationStatus> {
  if (!registerHighlight)
    return 'ready'

  const state = getHighlightRegistrationState(registerHighlight)
  if (state.completed.has(key))
    return 'ready'

  const cached = state.inFlight.get(key)
  if (cached)
    return cached

  // stream-markdown/Shiki registration mutates shared highlighter state, so
  // calls for the same registerHighlight implementation are serialized.
  const task = state.tail
    .catch(() => {})
    .then(() => registerHighlight(opts))
    .then(() => {
      state.completed.add(key)
      return 'ready' as const
    })
    .finally(() => {
      if (state.inFlight.get(key) === task)
        state.inFlight.delete(key)
    })

  state.inFlight.set(key, task)
  state.tail = task.catch(() => {})
  return task
}
