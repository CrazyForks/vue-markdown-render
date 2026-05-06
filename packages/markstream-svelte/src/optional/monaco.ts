let monacoModule: any = null
let importAttempted = false
let pendingImport: Promise<any | null> | null = null
let workersPreloaded = false
let codeBlockRuntimeReady = false

export function isCodeBlockRuntimeReady() {
  return codeBlockRuntimeReady
}

export function resetCodeBlockRuntimeReadyForTest() {
  codeBlockRuntimeReady = false
}

export async function preloadCodeBlockRuntime() {
  const runtime = await getUseMonaco()
  return !!runtime
}

async function preloadWorkers(mod: any) {
  if (workersPreloaded)
    return
  workersPreloaded = true
  const existingEnv = (globalThis as any)?.MonacoEnvironment
  if (existingEnv && (typeof existingEnv.getWorker === 'function' || typeof existingEnv.getWorkerUrl === 'function'))
    return
  if (typeof mod?.preloadMonacoWorkers === 'function')
    await mod.preloadMonacoWorkers()
}

async function warmupShikiTokenizer(mod: any) {
  const getOrCreateHighlighter = mod?.getOrCreateHighlighter
  if (typeof getOrCreateHighlighter !== 'function')
    return true

  try {
    const highlighter = await getOrCreateHighlighter(
      ['vitesse-dark', 'vitesse-light'],
      ['plaintext', 'text', 'javascript'],
    )

    if (highlighter && typeof highlighter.codeToTokens === 'function') {
      highlighter.codeToTokens('const a = 1', { lang: 'javascript', theme: 'vitesse-dark' })
    }

    return true
  }
  catch (error) {
    console.warn('[markstream-svelte] Failed to warm up stream-monaco tokenizer.', error)
    return false
  }
}

export async function getUseMonaco() {
  if (monacoModule)
    return monacoModule
  if (pendingImport)
    return await pendingImport
  if (importAttempted)
    return null

  pendingImport = (async () => {
    try {
      const imported: any = await import('stream-monaco')
      monacoModule = imported?.default ?? imported
      await preloadWorkers(monacoModule)
      codeBlockRuntimeReady = true
      void warmupShikiTokenizer(monacoModule)
      return monacoModule
    }
    catch {
      importAttempted = true
      return null
    }
  })()

  try {
    return await pendingImport
  }
  finally {
    pendingImport = null
  }
}
