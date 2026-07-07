import { describe, expect, it } from 'vitest'
import {
  clearHeightEstimationExperiment,
  estimateCodeBlockHeight,
  getHeightEstimationExperiment,
  getHeightEstimationRendererController,
  registerHeightEstimationRendererController,
  setHeightEstimationExperiment,
} from '../src/internal/heightEstimationExperiment'

describe('height estimation experiment internals', () => {
  it('stores config per custom id', () => {
    setHeightEstimationExperiment('test-height-exp', {
      enabled: true,
      textEstimation: true,
      codeBlockEstimation: false,
    })

    expect(getHeightEstimationExperiment('test-height-exp')).toEqual({
      enabled: true,
      textEstimation: true,
      codeBlockEstimation: false,
    })

    clearHeightEstimationExperiment('test-height-exp')
    expect(getHeightEstimationExperiment('test-height-exp')).toBeNull()
  })

  it('registers and removes renderer controllers', () => {
    const controller = {
      captureRestoreAnchor: () => ({ nodeIndex: 4, offsetWithinNodePx: 12 }),
      restoreAnchor: () => {},
      getAnchorDrift: () => 0,
      getReport: () => ({
        totalNodes: 1,
        measuredCount: 1,
        estimatedCount: 0,
        averageNodeHeight: 20,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
        estimatedTotalHeight: 20,
        width: 320,
        nodes: [],
      }),
    }

    const cleanup = registerHeightEstimationRendererController('test-height-controller', controller)
    expect(getHeightEstimationRendererController('test-height-controller')).toBe(controller)
    cleanup()
    expect(getHeightEstimationRendererController('test-height-controller')).toBeNull()
  })

  it('estimates markdown code block height deterministically', () => {
    const estimated = estimateCodeBlockHeight(
      {
        type: 'code_block',
        language: 'ts',
        code: 'one\ntwo\nthree',
        raw: '```ts\none\ntwo\nthree\n```',
      } as any,
      {
        rendererKind: 'markdown',
        showHeader: true,
      },
    )

    expect(estimated?.kind).toBe('code-block')
    expect(estimated?.rendererKind).toBe('markdown')
    expect(estimated?.contentHeight).toBeGreaterThan(0)
    expect(estimated?.height).toBeGreaterThan(estimated?.contentHeight ?? 0)
  })

  it('estimates standalone pre code blocks without shell header height', () => {
    const estimated = estimateCodeBlockHeight(
      {
        type: 'code_block',
        language: 'ts',
        code: 'one\ntwo\nthree',
        raw: '```ts\none\ntwo\nthree\n```',
      } as any,
      {
        rendererKind: 'pre',
        showHeader: true,
      },
    )

    expect(estimated?.rendererKind).toBe('pre')
    expect(estimated?.contentHeight).toBe(84)
    expect(estimated?.height).toBe(84)
  })

  it('does not count a terminal newline as an extra ordinary code line', () => {
    const withoutTerminalNewline = estimateCodeBlockHeight(
      {
        type: 'code_block',
        language: 'ts',
        code: 'one',
        raw: '```ts\none\n```',
      } as any,
      {
        rendererKind: 'monaco',
        showHeader: false,
      },
    )
    const withTerminalNewline = estimateCodeBlockHeight(
      {
        type: 'code_block',
        language: 'ts',
        code: 'one\n',
        raw: '```ts\none\n```',
      } as any,
      {
        rendererKind: 'monaco',
        showHeader: false,
      },
    )
    const withBlankLine = estimateCodeBlockHeight(
      {
        type: 'code_block',
        language: 'ts',
        code: 'one\n\n',
        raw: '```ts\none\n\n```',
      } as any,
      {
        rendererKind: 'monaco',
        showHeader: false,
      },
    )
    const loadingWithTerminalNewline = estimateCodeBlockHeight(
      {
        type: 'code_block',
        language: 'ts',
        code: 'one\n',
        raw: '```ts\none\n',
        loading: true,
      } as any,
      {
        rendererKind: 'monaco',
        showHeader: false,
      },
    )

    expect(withTerminalNewline?.contentHeight).toBe(withoutTerminalNewline?.contentHeight)
    expect(withBlankLine?.contentHeight).toBeGreaterThan(withTerminalNewline?.contentHeight ?? 0)
    expect(loadingWithTerminalNewline?.contentHeight).toBe(withBlankLine?.contentHeight)
  })

  it('estimates ordinary monaco code blocks from visible line height only', () => {
    const code = Array.from({ length: 24 }, (_, index) => `line ${index + 1}`).join('\n')
    const estimated = estimateCodeBlockHeight(
      {
        type: 'code_block',
        language: 'js',
        code,
        raw: `\`\`\`js\n${code}`,
        loading: true,
      } as any,
      {
        rendererKind: 'monaco',
        monacoOptions: {
          lineHeight: 18,
        },
        showHeader: false,
      },
    )

    expect(estimated?.contentHeight).toBe(432)
    expect(estimated?.height).toBe(432)
  })

  it('caps monaco estimate by max height', () => {
    const estimated = estimateCodeBlockHeight(
      {
        type: 'code_block',
        language: 'ts',
        code: new Array(120).fill('console.log("x")').join('\n'),
        raw: '```ts\n...\n```',
      } as any,
      {
        rendererKind: 'monaco',
        monacoOptions: {
          fontSize: 13,
          lineHeight: 30,
          MAX_HEIGHT: 320,
        },
        showHeader: true,
      },
    )

    expect(estimated?.contentHeight).toBe(320)
    expect(estimated?.height).toBe(360)
  })
})
