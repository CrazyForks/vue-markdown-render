import type { InjectionKey } from 'vue'
import type { MarkstreamNodeLifecycle } from '../types/node-renderer-props'
import { inject } from 'vue'

export const MARKSTREAM_NODE_LIFECYCLE_KEY
  = Symbol.for('markstream-vue:node-lifecycle') as InjectionKey<MarkstreamNodeLifecycle>

export function useMarkstreamNodeLifecycle() {
  return inject(MARKSTREAM_NODE_LIFECYCLE_KEY, null)
}
