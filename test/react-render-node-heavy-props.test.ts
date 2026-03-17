import type { RenderContext } from '../packages/markstream-react/src/types'
import { describe, expect, it } from 'vitest'
import { renderNode } from '../packages/markstream-react/src/renderers/renderNode'

describe('markstream-react heavy-node prop forwarding', () => {
  it('forwards mermaidProps to MermaidBlockNode render output', () => {
    const ctx: RenderContext = {
      customId: 'react-heavy-props-test',
      isDark: false,
      indexKey: 'react-heavy-props-test',
      typewriter: false,
      codeBlockProps: {},
      mermaidProps: {
        showHeader: false,
        renderDebounceMs: 180,
      },
      d2Props: {},
      infographicProps: {},
      showTooltips: true,
      codeBlockStream: true,
      renderCodeBlocksAsPre: false,
      events: {},
    }

    const element = renderNode({
      type: 'code_block',
      language: 'mermaid',
      code: 'graph LR\nA-->B\n',
      raw: '```mermaid\ngraph LR\nA-->B\n```',
    } as any, 'mermaid-props', ctx) as any

    expect(element?.props?.showHeader).toBe(false)
    expect(element?.props?.renderDebounceMs).toBe(180)
  })
})
