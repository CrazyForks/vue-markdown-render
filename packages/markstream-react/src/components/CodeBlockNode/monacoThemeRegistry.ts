import { scheduleMonacoThemeUpdate } from './monacoThemeScheduler'

type MonacoTheme = any
type SetThemeFn = (theme: MonacoTheme, force?: boolean) => Promise<void> | void

let desiredTheme: MonacoTheme | null = null
let desiredKey: string | null = null
let setThemeImpl: SetThemeFn | null = null
const listeners = new Set<() => void>()

function themeKey(theme: MonacoTheme): string | null {
  if (theme == null)
    return null
  if (typeof theme === 'string')
    return theme
  if (typeof theme === 'object' && 'name' in theme)
    return String((theme as any).name)
  try {
    return JSON.stringify(theme)
  }
  catch {
    return String(theme)
  }
}

function notify() {
  for (const listener of Array.from(listeners)) {
    try {
      listener()
    }
    catch {}
  }
}

export function subscribeMonacoThemeApplied(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function registerMonacoThemeSetter(setTheme: SetThemeFn | null | undefined) {
  if (typeof setTheme !== 'function')
    return
  setThemeImpl = setTheme
  if (desiredTheme != null && desiredKey != null) {
    void scheduleMonacoThemeUpdate(desiredTheme, setThemeImpl)
      .then(() => notify())
      .catch(() => {})
  }
}

export function setDesiredMonacoTheme(theme: MonacoTheme | null | undefined) {
  if (theme == null)
    return
  const key = themeKey(theme)
  if (!key)
    return
  if (desiredKey === key)
    return
  desiredTheme = theme
  desiredKey = key
  if (!setThemeImpl)
    return
  void scheduleMonacoThemeUpdate(desiredTheme, setThemeImpl)
    .then(() => notify())
    .catch(() => {})
}

export function getDesiredMonacoTheme(): MonacoTheme | null {
  return desiredTheme
}
