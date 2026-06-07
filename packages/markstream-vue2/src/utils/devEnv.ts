export function isDevEnvironment() {
  return Boolean(
    (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV,
  )
}
