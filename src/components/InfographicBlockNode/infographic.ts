export interface InfographicInstance {
  render: (source: string) => unknown
  destroy?: () => unknown
  on?: (event: string, handler: (payload: unknown) => void) => unknown
}

export interface InfographicConstructor {
  new (options: { container: HTMLElement, width?: string | number, height?: string | number }): InfographicInstance
}

export type InfographicLoader = () => Promise<unknown> | unknown

let cachedInfographic: InfographicConstructor | null = null
let infographicLoader: InfographicLoader | null = null
let loaderVersion = 0

export function setInfographicLoader(loader?: InfographicLoader | null) {
  infographicLoader = loader ?? null
  cachedInfographic = null
  loaderVersion++
}

export function enableInfographic(loader: InfographicLoader) {
  if (typeof loader !== 'function')
    throw new TypeError('enableInfographic requires a loader function for @antv/infographic')
  setInfographicLoader(loader)
}

export function disableInfographic() {
  setInfographicLoader()
}

export function isInfographicEnabled() {
  return typeof infographicLoader === 'function'
}

export async function getInfographic(): Promise<InfographicConstructor | null> {
  if (cachedInfographic)
    return cachedInfographic

  const loader = infographicLoader
  const version = loaderVersion
  if (!loader)
    return null
  const mod: any = await loader()
  if (version !== loaderVersion || loader !== infographicLoader)
    return null
  if (!mod)
    return null

  // Normalize module
  // Handle ESM default export or named export
  const defaultExport = (mod && (mod as any).default) ? (mod as any).default : mod

  const resolved = typeof defaultExport === 'function' && defaultExport.prototype?.render
    ? defaultExport
    : (mod.Infographic ?? defaultExport?.Infographic ?? defaultExport)
  if (version !== loaderVersion || loader !== infographicLoader)
    return null

  cachedInfographic = resolved
  return cachedInfographic
}
