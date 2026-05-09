export interface SmoothMarkdownStreamOptions {
  minCharsPerSecond?: number
  maxCharsPerSecond?: number
  targetLatencyMs?: number
  catchUpLatencyMs?: number
  catchUpThreshold?: number
  maxCommitFps?: number
  startDelayMs?: number
  maxCharsPerCommit?: number
  flushOnFinish?: boolean
}

export type SmoothStreamEvent = 'visible' | 'source' | 'done' | 'paused'

export type SmoothStreamNotify = (event: SmoothStreamEvent) => void

export interface ResolveStreamingTextStateOptions {
  nextContent: string
  previousContent: string
  typewriterEnabled: boolean
}

export interface StreamingTextStateResult {
  settledContent: string
  streamedDelta: string
  appended: boolean
}

export interface StreamingRenderState {
  settledContent: string
  streamedDelta: string
}

export interface ResolveStreamingTextUpdateOptions {
  nextContent: string
  persistedContent?: string
  currentState: StreamingRenderState
  typewriterEnabled: boolean
  streamRenderVersionChanged?: boolean
}
