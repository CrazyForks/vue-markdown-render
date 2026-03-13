import { describe, expect, it, vi } from 'vitest'
import { enhanceRenderedHtml } from '../packages/markstream-angular/src/enhanceRenderedHtml'

const monacoCleanup = vi.fn()

vi.mock('../packages/markstream-angular/src/optional/katex', () => ({
  getKatex: vi.fn(async () => ({
    renderToString(source: string, options?: { displayMode?: boolean }) {
      return options?.displayMode
        ? `<span class="katex-display">${source}</span>`
        : `<span class="katex">${source}</span>`
    },
  })),
}))

vi.mock('../packages/markstream-angular/src/optional/mermaid', () => ({
  getMermaid: vi.fn(async () => ({
    render: vi.fn(async (_id: string, source: string) => ({
      svg: `<svg data-mermaid="1">${source}</svg>`,
    })),
  })),
}))

vi.mock('../packages/markstream-angular/src/optional/d2', () => ({
  getD2: vi.fn(async () => class MockD2 {
    async compile(code: string) {
      return { diagram: { code }, renderOptions: {} }
    }

    async render(diagram: { code: string }) {
      return {
        svg: `<svg data-d2="1"><text>${diagram.code}</text></svg>`,
      }
    }
  }),
}))

vi.mock('../packages/markstream-angular/src/optional/infographic', () => ({
  getInfographic: vi.fn(async () => class MockInfographic {
    container: HTMLElement

    constructor(options: { container: HTMLElement }) {
      this.container = options.container
    }

    render(source: string) {
      this.container.innerHTML = `<svg data-infographic="1"><text>${source}</text></svg>`
    }

    destroy() {
      this.container.dataset.infographicDestroyed = '1'
    }
  }),
}))

vi.mock('../packages/markstream-angular/src/optional/monaco', () => ({
  getUseMonaco: vi.fn(async () => ({
    useMonaco: vi.fn(() => ({
      async createEditor(container: HTMLElement, code: string, language: string) {
        container.innerHTML = `<div data-monaco="1" data-language="${language}">${code}</div>`
      },
      async setTheme() {},
      cleanupEditor: monacoCleanup,
    })),
  })),
}))

describe('markstream-angular enhanceRenderedHtml', () => {
  it('hydrates math, mermaid, monaco, infographic, and d2 blocks in place', async () => {
    monacoCleanup.mockReset()
    const onCopy = vi.fn()
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markstream-angular markdown-renderer">
        <span class="markstream-nested-math" data-display="inline">E = mc^2</span>
        <pre class="markstream-nested-math-block"><code>\\int_0^1 x^2 dx</code></pre>
        <pre data-markstream-code-block="1" data-markstream-language="mermaid"><code class="language-mermaid">graph TD; A-->B;</code></pre>
        <pre data-markstream-code-block="1" data-markstream-language="ts"><code class="language-ts">const value = 1</code></pre>
        <pre data-markstream-code-block="1" data-markstream-language="ts" data-markstream-diff="1" data-markstream-original="Y29uc3QgdmFsdWUgPSAx" data-markstream-updated="Y29uc3QgdmFsdWU6IG51bWJlciA9IDE="><code class="language-ts">-const value = 1
+const value: number = 1</code></pre>
        <pre data-markstream-code-block="1" data-markstream-language="infographic"><code class="language-infographic">infographic list-row-simple-horizontal-arrow</code></pre>
        <pre data-markstream-code-block="1" data-markstream-language="d2"><code class="language-d2">a -> b</code></pre>
      </div>
    `

    const shell = root.querySelector('.markstream-angular') as HTMLElement
    const handle = await enhanceRenderedHtml(shell, { final: true, isDark: true, onCopy, showTooltips: true })

    expect(shell.innerHTML).toContain('class="katex"')
    expect(shell.innerHTML).toContain('class="katex-display"')
    expect(shell.innerHTML).toContain('data-mermaid="1"')
    expect(shell.innerHTML).toContain('markstream-angular-mermaid')
    expect(shell.innerHTML).toContain('data-monaco="1"')
    expect(shell.innerHTML).toContain('data-markstream-monaco-diff="1"')
    expect(shell.innerHTML).toContain('data-infographic="1"')
    expect(shell.innerHTML).toContain('data-d2="1"')
    expect(shell.innerHTML).toContain('markstream-angular-enhanced-block__action')

    const copyButton = shell.querySelector<HTMLButtonElement>('.markstream-angular-enhanced-block__action')
    copyButton?.click()
    expect(onCopy).toHaveBeenCalled()

    handle.dispose()
    expect(monacoCleanup).toHaveBeenCalledTimes(2)
  })

  it('skips heavy code/diagram upgrades while content is still streaming', async () => {
    monacoCleanup.mockReset()
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markstream-angular markdown-renderer">
        <span class="markstream-nested-math" data-display="inline">a+b</span>
        <pre data-markstream-code-block="1" data-markstream-language="ts"><code class="language-ts">const value = 1</code></pre>
        <pre data-markstream-code-block="1" data-markstream-language="d2"><code class="language-d2">a -> b</code></pre>
      </div>
    `

    const shell = root.querySelector('.markstream-angular') as HTMLElement
    await enhanceRenderedHtml(shell, { final: false })

    expect(shell.innerHTML).toContain('class="katex"')
    expect(shell.innerHTML).toContain('language-ts')
    expect(shell.innerHTML).not.toContain('data-monaco="1"')
    expect(shell.innerHTML).not.toContain('data-d2="1"')
    expect(monacoCleanup).not.toHaveBeenCalled()
  })
})
