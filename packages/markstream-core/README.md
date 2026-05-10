# markstream-core

Framework-agnostic smooth streaming controller and streaming text state utilities for [Markstream](https://github.com/Simon-He95/markstream-vue).

This package extracts the core pacing algorithm and streaming text resolution logic shared across all Markstream framework packages (Vue 3, Vue 2, React, Angular, Svelte).

## Installation

```bash
npm install markstream-core
```

## API

### `SmoothMarkdownStreamController`

A callback-based streaming controller that progressively reveals text at a configurable pace using `requestAnimationFrame`.

```ts
import { SmoothMarkdownStreamController } from 'markstream-core'

const controller = new SmoothMarkdownStreamController(
  { minCharsPerSecond: 40, maxCharsPerSecond: 1000 },
  (event) => {
    if (event === 'visible') updateUI(controller.visible)
    if (event === 'done') onStreamDone()
  }
)

controller.enqueue(chunk)
controller.finish()
controller.flush()
controller.pause()
controller.resume()
controller.destroy()
```

#### Options (`SmoothMarkdownStreamOptions`)

| Option | Default | Description |
|---|---|---|
| `minCharsPerSecond` | 40 | Minimum reveal speed |
| `maxCharsPerSecond` | 1000 | Maximum reveal speed |
| `targetLatencyMs` | 900 | Target latency for pacing calculation |
| `catchUpLatencyMs` | 350 | Latency threshold for catch-up mode |
| `catchUpThreshold` | 600 | Character backlog that triggers catch-up |
| `maxCommitFps` | 30 | Maximum commits per second |
| `startDelayMs` | 80 | Delay before first reveal |
| `maxCharsPerCommit` | 80 | Maximum characters per animation frame |
| `flushOnFinish` | false | Auto-flush when `finish()` is called |

### `resolveStreamingTextState`

Resolves the next streaming text state for simple append detection.

```ts
import { resolveStreamingTextState } from 'markstream-core'

const result = resolveStreamingTextState({
  nextContent: 'hello world',
  previousContent: 'hello',
  typewriterEnabled: true,
})
// result = { settledContent: 'hello', streamedDelta: ' world', appended: true }
```

### `resolveStreamingTextUpdate`

Extended resolver that handles React StrictMode replay guards and stream version resets.

```ts
import { resolveStreamingTextUpdate } from 'markstream-core'

const result = resolveStreamingTextUpdate({
  nextContent: 'hello world!',
  currentState: { settledContent: 'hello', streamedDelta: ' world' },
  typewriterEnabled: true,
})
```

## Framework Adapters

- **Vue 3**: `useSmoothMarkdownStream` in `markstream-vue` wraps the core controller with Vue reactivity.
- **React**: Direct import from `markstream-core` or via `markstream-react` re-exports.
- **Vue 2**: Re-exports via `markstream-vue2`.
- **Angular**: Re-exports via `markstream-angular`.
- **Svelte**: Re-exports via `markstream-svelte`.

## License

MIT
