export interface D2Instance {
  D2?: D2Constructor
  compile?: (source: string, options?: Record<string, unknown>) => Promise<unknown> | unknown
  render?: (input: unknown, options?: Record<string, unknown>) => Promise<unknown> | unknown
}

export interface D2Constructor {
  new (): D2Instance
  D2?: D2Constructor
  compile?: D2Instance['compile']
}

export type D2Module = D2Constructor | D2Instance
export type D2Loader = () => Promise<unknown> | unknown

const defaultD2Loader: D2Loader = () => import('@terrastruct/d2')

let cachedD2: any = null
let d2Loader: D2Loader | null = defaultD2Loader
let pendingD2: Promise<D2Module | null> | null = null
let defaultD2LoadFailed = false
let defaultD2WarningShown = false
let d2LoaderVersion = 0

function resetCachedD2() {
  cachedD2 = null
  pendingD2 = null
  defaultD2LoadFailed = false
  defaultD2WarningShown = false
}

function normalizeD2Module(mod: any) {
  if (!mod)
    return mod
  if (mod.D2 && typeof mod.D2 === 'function')
    return mod.D2
  if (mod.default && mod.default.D2 && typeof mod.default.D2 === 'function')
    return mod.default.D2
  const candidate = mod.default ?? mod
  if (typeof candidate === 'function')
    return candidate
  if (candidate?.D2 && typeof candidate.D2 === 'function')
    return candidate.D2
  return candidate
}

export function setD2Loader(loader: D2Loader | null) {
  d2Loader = loader
  d2LoaderVersion++
  resetCachedD2()
}

export function enableD2(loader?: D2Loader) {
  setD2Loader(loader ?? defaultD2Loader)
}

export function disableD2() {
  setD2Loader(null)
}

export function isD2Enabled() {
  return typeof d2Loader === 'function'
}

function warnDefaultD2LoadFailed(err: unknown) {
  if (defaultD2WarningShown)
    return

  defaultD2WarningShown = true
  console.warn(
    '[markstream-vue] Optional dependency "@terrastruct/d2" is not installed. D2 blocks will render as source.',
    err,
  )
}

export async function getD2(): Promise<D2Module | null> {
  if (cachedD2)
    return cachedD2

  const loader = d2Loader
  const version = d2LoaderVersion
  if (!loader)
    return null

  if (loader === defaultD2Loader && defaultD2LoadFailed)
    return null

  if (pendingD2)
    return pendingD2

  pendingD2 = (async () => {
    let mod: any
    try {
      mod = await loader()
    }
    catch (err) {
      if (loader === defaultD2Loader) {
        if (version === d2LoaderVersion && loader === d2Loader) {
          defaultD2LoadFailed = true
          warnDefaultD2LoadFailed(err)
        }
        return null
      }
      throw err
    }
    finally {
      if (version === d2LoaderVersion && loader === d2Loader)
        pendingD2 = null
    }

    if (version !== d2LoaderVersion || loader !== d2Loader)
      return null

    if (!mod)
      return null

    cachedD2 = normalizeD2Module(mod)
    return cachedD2
  })()

  return pendingD2
}
