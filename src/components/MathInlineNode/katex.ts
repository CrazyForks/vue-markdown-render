export type KatexLoader = () => Promise<any> | any

let katex: any = null
let importAttempted = false
let katexLoader: KatexLoader | null = defaultKatexLoader

function defaultKatexLoader() {
  return (async () => {
    const mod = await import('katex')
    await import('katex/contrib/mhchem')
    return mod
  })()
}

function resetCache() {
  katex = null
  importAttempted = false
}

export function setKatexLoader(loader: KatexLoader | null) {
  katexLoader = loader
  resetCache()
}

export function enableKatex(loader?: KatexLoader) {
  setKatexLoader(loader ?? defaultKatexLoader)
}

export function disableKatex() {
  setKatexLoader(null)
}

export function isKatexEnabled() {
  return typeof katexLoader === 'function'
}

export async function getKatex() {
  if (katex)
    return katex
  if (importAttempted)
    return null
  const loader = katexLoader
  if (!loader) {
    importAttempted = true
    return null
  }
  try {
    const result = await loader()
    if (result) {
      katex = result
      return katex
    }
  }
  catch {
    // Swallow errors here; callers handle lack of KaTeX support gracefully.
  }
  importAttempted = true
  return null
}
