interface ImportMetaEnvLike {
  DEV?: boolean
  MODE?: string
}

export function isDevEnvironment(): boolean {
  const viteEnv = (import.meta as unknown as { env?: ImportMetaEnvLike }).env
  if (typeof viteEnv?.DEV === 'boolean')
    return viteEnv.DEV

  if (typeof viteEnv?.MODE === 'string')
    return viteEnv.MODE === 'development'

  const globalProcess = Reflect.get(globalThis, 'process') as { env?: { NODE_ENV?: string } } | undefined

  return globalProcess?.env?.NODE_ENV === 'development'
}
