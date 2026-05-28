export interface IndexKeyLikeProps {
  indexKey?: string | number | null
}

export function resolveLifecycleIndexKey(
  props: object,
  attrs: Record<string, unknown>,
) {
  const raw = (props as IndexKeyLikeProps).indexKey
    ?? attrs['index-key']
    ?? attrs.indexKey

  return raw == null || raw === ''
    ? ''
    : String(raw)
}
