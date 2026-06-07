export function isDevEnvironment() {
  const viteEnv = (import.meta as unknown as { env?: { DEV?: boolean, MODE?: string } }).env
  if (typeof viteEnv?.DEV === 'boolean')
    return viteEnv.DEV

  return viteEnv?.MODE === 'development'
}
