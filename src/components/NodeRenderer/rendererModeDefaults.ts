import type {
  NodeRendererCodeRenderer,
  NodeRendererMode,
  NodeRendererProps,
} from '../../types/node-renderer-props'

export type RendererModeDefaults = Pick<
  NodeRendererProps,
  | 'showTooltips'
  | 'fade'
  | 'batchRendering'
  | 'initialRenderBatchSize'
  | 'renderBatchSize'
  | 'renderBatchDelay'
  | 'renderBatchBudgetMs'
  | 'renderBatchIdleTimeoutMs'
  | 'deferNodesUntilVisible'
  | 'maxLiveNodes'
  | 'liveNodeBuffer'
  | 'nodeVirtual'
>

export const RENDERER_MODE_DEFAULTS: Record<NodeRendererMode, RendererModeDefaults> = {
  docs: {
    showTooltips: true,
    fade: true,
    batchRendering: true,
    initialRenderBatchSize: 40,
    renderBatchSize: 80,
    renderBatchDelay: 16,
    renderBatchBudgetMs: 6,
    renderBatchIdleTimeoutMs: 120,
    deferNodesUntilVisible: true,
    maxLiveNodes: 220,
    liveNodeBuffer: 60,
    nodeVirtual: 'auto',
  },
  chat: {
    showTooltips: false,
    fade: false,
    batchRendering: true,
    initialRenderBatchSize: 16,
    renderBatchSize: 16,
    renderBatchDelay: 8,
    renderBatchBudgetMs: 4,
    renderBatchIdleTimeoutMs: 120,
    deferNodesUntilVisible: true,
    maxLiveNodes: 0,
    liveNodeBuffer: 0,
    nodeVirtual: 'auto',
  },
  minimal: {
    showTooltips: false,
    fade: false,
    batchRendering: true,
    initialRenderBatchSize: 16,
    renderBatchSize: 16,
    renderBatchDelay: 8,
    renderBatchBudgetMs: 4,
    renderBatchIdleTimeoutMs: 120,
    deferNodesUntilVisible: true,
    maxLiveNodes: 0,
    liveNodeBuffer: 0,
    nodeVirtual: 'auto',
  },
}

export function normalizeRendererMode(value: unknown): NodeRendererMode {
  return value === 'chat' || value === 'minimal' || value === 'docs'
    ? value
    : 'docs'
}

export function resolveNodeRendererCodeRenderer(options: {
  mode: NodeRendererMode
  codeRenderer: NodeRendererProps['codeRenderer']
  renderCodeBlocksAsPre: NodeRendererProps['renderCodeBlocksAsPre']
}): NodeRendererCodeRenderer {
  if (options.renderCodeBlocksAsPre === true)
    return 'pre'

  if (
    options.codeRenderer === 'pre'
    || options.codeRenderer === 'shiki'
    || options.codeRenderer === 'monaco'
  ) {
    return options.codeRenderer
  }

  if (options.renderCodeBlocksAsPre === false)
    return 'monaco'

  return options.mode === 'docs' ? 'monaco' : 'pre'
}
