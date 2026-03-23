import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { decodeMarkdownHash } from '../playground-shared/testPageState'
import TestPage from '../playground/src/pages/test.vue'

vi.mock('@iconify/vue', () => ({
  Icon: {
    name: 'IconStub',
    props: {
      icon: {
        type: String,
        default: '',
      },
    },
    template: '<span data-testid="icon">{{ icon }}</span>',
  },
}))

vi.mock('../src/components/NodeRenderer', () => ({
  default: {
    name: 'MarkdownRenderStub',
    props: {
      content: {
        type: String,
        default: '',
      },
      mermaidProps: {
        type: Object,
        default: () => ({}),
      },
      d2Props: {
        type: Object,
        default: () => ({}),
      },
      infographicProps: {
        type: Object,
        default: () => ({}),
      },
    },
    template: '<div data-testid="preview">{{ content }}</div>',
  },
}))

vi.mock('../src/components/CodeBlockNode', () => ({
  default: { name: 'CodeBlockNodeStub', template: '<div />' },
}))

vi.mock('../src/components/MarkdownCodeBlockNode', () => ({
  default: { name: 'MarkdownCodeBlockNodeStub', template: '<div />' },
}))

vi.mock('../src/components/PreCodeNode', () => ({
  default: { name: 'PreCodeNodeStub', template: '<div />' },
}))

vi.mock('../src/components/CodeBlockNode/monaco', () => ({
  getUseMonaco: vi.fn(),
}))

vi.mock('../src/utils/nodeComponents', () => ({
  setCustomComponents: vi.fn(),
}))

let katexEnabled = true
vi.mock('../src/components/MathInlineNode/katex', () => ({
  enableKatex: vi.fn(() => {
    katexEnabled = true
  }),
  disableKatex: vi.fn(() => {
    katexEnabled = false
  }),
  isKatexEnabled: vi.fn(() => katexEnabled),
}))

let mermaidEnabled = true
vi.mock('../src/components/MermaidBlockNode/mermaid', () => ({
  enableMermaid: vi.fn(() => {
    mermaidEnabled = true
  }),
  disableMermaid: vi.fn(() => {
    mermaidEnabled = false
  }),
  isMermaidEnabled: vi.fn(() => mermaidEnabled),
}))

vi.mock('../src/workers/katexWorkerClient', () => ({
  setKaTeXWorker: vi.fn(),
}))

vi.mock('../src/workers/mermaidWorkerClient', () => ({
  setMermaidWorker: vi.fn(),
}))

vi.mock('../src/workers/katexRenderer.worker?worker&inline', () => ({
  default: class FakeKatexWorker {},
}))

vi.mock('../src/workers/mermaidParser.worker?worker&inline', () => ({
  default: class FakeMermaidWorker {},
}))

const originalFullscreenElement = Object.getOwnPropertyDescriptor(document, 'fullscreenElement')
const originalExitFullscreen = Object.getOwnPropertyDescriptor(document, 'exitFullscreen')
const originalRequestFullscreen = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'requestFullscreen')

async function mountTestPage() {
  const wrapper = mount(TestPage)
  await nextTick()
  return wrapper
}

describe('playground /test smoke', () => {
  beforeEach(() => {
    katexEnabled = true
    mermaidEnabled = true
    window.localStorage.removeItem('vmr-test-dark')
    window.history.replaceState({}, '', '/test')
  })

  afterEach(() => {
    vi.useRealTimers()
    window.localStorage.removeItem('vmr-test-dark')

    if (originalFullscreenElement)
      Object.defineProperty(document, 'fullscreenElement', originalFullscreenElement)
    else
      Reflect.deleteProperty(document, 'fullscreenElement')

    if (originalExitFullscreen)
      Object.defineProperty(document, 'exitFullscreen', originalExitFullscreen)
    else
      Reflect.deleteProperty(document, 'exitFullscreen')

    if (originalRequestFullscreen)
      Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', originalRequestFullscreen)
    else
      Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen')
  })

  it('opens the /test route and renders the lab shell', async () => {
    const wrapper = await mountTestPage()

    expect(wrapper.text()).toContain('Markstream Test Page')
    expect(wrapper.text()).toContain('Cross-framework regression lab')
    expect(wrapper.text()).toContain('版本沙箱')
    expect(wrapper.text()).toContain('Angular')
    expect(wrapper.get('iframe').attributes('src')).toContain('/test-sandbox?framework=vue3')

    wrapper.unmount()
  })

  it('switches samples and updates cross-framework links with the current markdown', async () => {
    const wrapper = await mountTestPage()

    const diffButton = wrapper.findAll('button').find(button => button.text().includes('Diff 与代码流'))
    expect(diffButton).toBeTruthy()

    await diffButton!.trigger('click')
    await nextTick()

    const textarea = wrapper.get('textarea')
    expect((textarea.element as HTMLTextAreaElement).value).toContain('Diff Regression')

    await textarea.setValue('## carried across frameworks')
    await nextTick()

    const vue2Link = wrapper.findAll('a').find(link => link.text().includes('Vue 2'))
    expect(vue2Link).toBeTruthy()
    const href = vue2Link!.attributes('href') || ''
    const hash = new URL(href, 'https://markstream.local').hash

    expect(href).toContain('/test#data=')
    expect(decodeMarkdownHash(hash)).toBe('## carried across frameworks')

    wrapper.unmount()
  })

  it('starts streaming and progressively updates the preview', async () => {
    vi.useFakeTimers()
    const wrapper = await mountTestPage()

    const textarea = wrapper.get('textarea')
    const fullContent = (textarea.element as HTMLTextAreaElement).value
    const streamButton = wrapper.findAll('button').find(button => button.text().includes('开始流式渲染'))
    expect(streamButton).toBeTruthy()

    await streamButton!.trigger('click')
    await nextTick()

    const preview = wrapper.get('[data-testid="preview"]')
    expect(preview.text().length).toBeLessThan(fullContent.length)

    await vi.advanceTimersByTimeAsync(800)
    await nextTick()

    const initialLength = preview.text().length
    expect(initialLength).toBeGreaterThan(0)
    expect(initialLength).toBeLessThan(fullContent.length)

    await vi.advanceTimersByTimeAsync(600)
    await nextTick()

    expect(preview.text().length).toBeGreaterThan(initialLength)
    expect(preview.text().length).toBeLessThan(fullContent.length)

    wrapper.unmount()
  })

  it('toggles preview fullscreen mode from the preview card', async () => {
    let fullscreenElement: Element | null = null
    let previewCardElement: Element | null = null
    const requestFullscreen = vi.fn(async () => {
      fullscreenElement = previewCardElement
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    const exitFullscreen = vi.fn(async () => {
      fullscreenElement = null
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    })
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    })
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    })

    const wrapper = await mountTestPage()
    previewCardElement = wrapper.get('.workspace-card--preview').element
    const button = wrapper.get('[data-testid="preview-fullscreen-button"]')

    expect(button.text()).toContain('全屏预览')

    await button.trigger('click')
    await nextTick()

    expect(requestFullscreen).toHaveBeenCalledTimes(1)
    expect(button.text()).toContain('退出全屏')

    await button.trigger('click')
    await nextTick()

    expect(exitFullscreen).toHaveBeenCalledTimes(1)
    expect(button.text()).toContain('全屏预览')

    wrapper.unmount()
  })

  it('removes infographic height caps in preview fullscreen mode', async () => {
    let fullscreenElement: Element | null = null
    let previewCardElement: Element | null = null
    const requestFullscreen = vi.fn(async () => {
      fullscreenElement = previewCardElement
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    })
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    })

    const wrapper = await mountTestPage()
    previewCardElement = wrapper.get('.workspace-card--preview').element
    const preview = wrapper.getComponent({ name: 'MarkdownRenderStub' })
    const button = wrapper.get('[data-testid="preview-fullscreen-button"]')

    expect(preview.props('infographicProps')).toEqual({ maxHeight: '500px' })

    await button.trigger('click')
    await nextTick()

    expect(preview.props('infographicProps')).toEqual({ maxHeight: 'none' })

    wrapper.unmount()
  })

  it('keeps d2 preview unconstrained so the outer preview pane owns scrolling', async () => {
    const wrapper = await mountTestPage()
    const preview = wrapper.getComponent({ name: 'MarkdownRenderStub' })

    expect(preview.props('d2Props')).toEqual({ maxHeight: 'none' })

    wrapper.unmount()
  })

  it('toggles dark and light appearance from the icon button', async () => {
    const wrapper = await mountTestPage()
    const page = wrapper.get('.test-lab')
    const button = wrapper.get('[data-testid="theme-toggle-button"]')

    expect(page.classes()).not.toContain('test-lab--dark')
    expect(button.attributes('aria-label')).toBe('切换到暗色模式')

    await button.trigger('click')
    await nextTick()

    expect(page.classes()).toContain('test-lab--dark')
    expect(button.attributes('aria-label')).toBe('切换到浅色模式')

    await button.trigger('click')
    await nextTick()

    expect(page.classes()).not.toContain('test-lab--dark')

    wrapper.unmount()
  })
})
