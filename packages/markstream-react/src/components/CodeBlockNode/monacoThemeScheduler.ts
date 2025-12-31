type MonacoTheme = any
type SetThemeFn = (theme: MonacoTheme, force?: boolean) => Promise<void> | void

let setThemeImpl: SetThemeFn | null = null
let applying = false
let inFlight: Promise<void> | null = null
let inFlightKey: string | null = null
let pendingTheme: MonacoTheme | null = null
let pendingKey: string | null = null
let lastAppliedKey: string | null = null

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

export function scheduleMonacoThemeUpdate(theme: MonacoTheme, setTheme: SetThemeFn): Promise<void> {
  const key = themeKey(theme)
  if (!key)
    return Promise.resolve()

  if (setThemeImpl !== setTheme)
    setThemeImpl = setTheme

  if (!applying && lastAppliedKey === key)
    return Promise.resolve()

  if (inFlight && (pendingKey === key || inFlightKey === key))
    return inFlight

  pendingTheme = theme
  pendingKey = key

  if (inFlight)
    return inFlight

  applying = true
  inFlight = (async () => {
    while (pendingTheme != null && pendingKey != null) {
      const nextTheme = pendingTheme
      const nextKey = pendingKey
      pendingTheme = null
      pendingKey = null
      if (lastAppliedKey === nextKey)
        continue
      const impl = setThemeImpl
      if (!impl)
        break
      try {
        inFlightKey = nextKey
        await Promise.resolve(impl(nextTheme))
        lastAppliedKey = nextKey
      }
      catch {}
    }
  })().finally(() => {
    applying = false
    inFlight = null
    inFlightKey = null
  })

  return inFlight
}
