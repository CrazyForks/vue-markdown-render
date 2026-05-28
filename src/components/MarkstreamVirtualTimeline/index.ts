import type { App } from 'vue'
import MarkstreamVirtualTimeline from './MarkstreamVirtualTimeline.vue'

type InstallableComponent<T> = T & {
  install?: (app: App) => void
  __name?: string
  name?: string
}

const _MarkstreamVirtualTimeline = MarkstreamVirtualTimeline as InstallableComponent<typeof MarkstreamVirtualTimeline>

_MarkstreamVirtualTimeline.install = (app: App) => {
  const compName = _MarkstreamVirtualTimeline.__name ?? _MarkstreamVirtualTimeline.name ?? 'MarkstreamVirtualTimeline'
  app.component(compName as string, MarkstreamVirtualTimeline)
}

export default _MarkstreamVirtualTimeline
