export interface RegisterHighlightOptions {
  themes?: readonly string[]
  langs?: readonly string[]
}

export interface ShikiRendererOptions {
  theme?: string
  themes?: readonly string[]
  langs?: readonly string[]
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
  registeredThemes: string[]
  registeredLangs: string[]
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
      registeredThemes: [],
      registeredLangs: [],
      tail: Promise.resolve(),
    }
    sharedHighlightRegistrationStates.set(registerHighlight, state)
  }
  return state
}

function appendUnique(base: readonly string[], incoming?: readonly string[]) {
  if (!incoming?.length)
    return [...base]

  const next = [...base]
  const seen = new Set(next)

  for (const value of incoming) {
    if (!seen.has(value)) {
      seen.add(value)
      next.push(value)
    }
  }

  return next
}

function hasAnyRegisterValues(opts: RegisterHighlightOptions) {
  return Boolean(opts.themes?.length || opts.langs?.length)
}

function hasAllValues(registered: readonly string[], requested?: readonly string[]) {
  if (!requested?.length)
    return true

  const registeredSet = new Set(registered)
  return requested.every(value => registeredSet.has(value))
}

function hasThemeOrder(registered: readonly string[], requested?: readonly string[]) {
  if (!requested?.length)
    return true

  if (requested.length > registered.length)
    return false

  return requested.every((value, index) => registered[index] === value)
}

function isRegistrationCovered(
  state: HighlightRegistrationState,
  opts: RegisterHighlightOptions,
) {
  return hasAnyRegisterValues(opts)
    && hasThemeOrder(state.registeredThemes, opts.themes)
    && hasAllValues(state.registeredLangs, opts.langs)
}

function getCumulativeRegisterOptions(
  state: HighlightRegistrationState,
  opts: RegisterHighlightOptions,
): RegisterHighlightOptions {
  if (!hasAnyRegisterValues(opts))
    return opts

  const nextThemes = opts.themes?.length
    ? appendUnique(opts.themes, state.registeredThemes)
    : [...state.registeredThemes]
  const nextLangs = appendUnique(state.registeredLangs, opts.langs)

  return {
    ...(nextThemes.length ? { themes: nextThemes } : {}),
    ...(nextLangs.length ? { langs: nextLangs } : {}),
  }
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

  if (isRegistrationCovered(state, opts)) {
    state.completed.add(key)
    return 'ready'
  }

  const cached = state.inFlight.get(key)
  if (cached)
    return cached

  // stream-markdown/Shiki registration mutates shared highlighter state, so
  // calls for the same registerHighlight implementation are serialized.
  const task = state.tail
    .catch(() => {})
    .then(() => {
      if (state.completed.has(key) || isRegistrationCovered(state, opts)) {
        state.completed.add(key)
        return 'ready' as const
      }

      const cumulativeOptions = getCumulativeRegisterOptions(state, opts)
      const cumulativeKey = getHighlightRegistrationKey(
        cumulativeOptions.themes,
        cumulativeOptions.langs,
      )

      if (state.completed.has(cumulativeKey) || isRegistrationCovered(state, cumulativeOptions)) {
        state.completed.add(key)
        state.completed.add(cumulativeKey)
        return 'ready' as const
      }

      return Promise.resolve(registerHighlight(cumulativeOptions)).then(() => {
        state.registeredThemes = cumulativeOptions.themes ? [...cumulativeOptions.themes] : []
        state.registeredLangs = cumulativeOptions.langs ? [...cumulativeOptions.langs] : []
        state.completed.add(cumulativeKey)
        return 'ready' as const
      })
    })
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
