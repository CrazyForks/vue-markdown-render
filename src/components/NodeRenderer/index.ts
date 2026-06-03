import type { App } from 'vue'
import NodeRenderer from './NodeRenderer.vue'

type InstallableComponent<T> = T & {
  install?: (app: App) => void
  __name?: string
  name?: string
}

const _NodeRenderer = NodeRenderer as InstallableComponent<typeof NodeRenderer>

_NodeRenderer.install = (app: App) => {
  const names = new Set(
    [
      'MarkdownRender',
      'NodeRenderer',
      _NodeRenderer.__name,
      _NodeRenderer.name,
    ].filter((name): name is string => Boolean(name)),
  )

  for (const name of names)
    app.component(name, NodeRenderer)
}

export default _NodeRenderer
