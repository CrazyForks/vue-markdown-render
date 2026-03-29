import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { buildTestPageHref, decodeMarkdownHash } from '../playground-shared/testPageState'
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
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
const originalCreateSVGPoint = typeof SVGSVGElement === 'undefined'
  ? undefined
  : Object.getOwnPropertyDescriptor(SVGSVGElement.prototype, 'createSVGPoint')

async function mountTestPage() {
  const wrapper = mount(TestPage)
  await nextTick()
  return wrapper
}

function createLongMarkdown() {
  return Array.from(
    { length: 600 },
    (_, index) => `- row ${index}: ${index.toString(36)}${(index * 13).toString(36)}${(index * 29).toString(36)}${(index * 47).toString(36)}`,
  ).join('\n')
}

function createOversizedMarkdown() {
  let seed = 0x12345678
  const nextChunk = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return `${seed.toString(36).padStart(7, '0')}${((seed >>> 1) ^ 0x5A5A5A5A).toString(36).padStart(7, '0')}`
  }

  return [
    '```text',
    ...Array.from({ length: 2400 }, (_, index) => `${index.toString(36).padStart(4, '0')} ${nextChunk()}${nextChunk()}${nextChunk()}${nextChunk()}`),
    '```',
  ].join('\n')
}

describe('playground /test smoke', () => {
  beforeEach(() => {
    katexEnabled = true
    mermaidEnabled = true
    window.localStorage.clear()
    window.history.replaceState({}, '', '/test')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })

    if (typeof SVGSVGElement !== 'undefined' && !SVGSVGElement.prototype.createSVGPoint) {
      Object.defineProperty(SVGSVGElement.prototype, 'createSVGPoint', {
        configurable: true,
        value: () => ({
          x: 0,
          y: 0,
          matrixTransform: () => ({ x: 0, y: 0 }),
        }),
      })
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    window.localStorage.clear()

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

    if (originalClipboard)
      Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else
      Reflect.deleteProperty(navigator, 'clipboard')

    if (typeof SVGSVGElement !== 'undefined') {
      if (originalCreateSVGPoint)
        Object.defineProperty(SVGSVGElement.prototype, 'createSVGPoint', originalCreateSVGPoint)
      else
        Reflect.deleteProperty(SVGSVGElement.prototype, 'createSVGPoint')
    }
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

  it('copies a preview-only share link from the preview toolbar', async () => {
    const wrapper = await mountTestPage()
    const textarea = wrapper.get('textarea')

    await textarea.setValue('## shared preview')
    await nextTick()

    await wrapper.get('[data-testid="preview-share-button"]').trigger('click')

    const writeText = navigator.clipboard.writeText as ReturnType<typeof vi.fn>
    expect(writeText).toHaveBeenCalledTimes(1)

    const href = writeText.mock.calls[0][0]
    const url = new URL(href)

    expect(url.pathname).toBe('/test')
    expect(url.searchParams.get('view')).toBe('preview')
    expect(decodeMarkdownHash(url.hash)).toBe('## shared preview')

    wrapper.unmount()
  })

  it('keeps preview share links in the url for larger markdown inputs', async () => {
    const wrapper = await mountTestPage()
    const textarea = wrapper.get('textarea')
    const longMarkdown = createLongMarkdown()

    await textarea.setValue(longMarkdown)
    await nextTick()
    await wrapper.get('[data-testid="preview-share-button"]').trigger('click')

    const writeText = navigator.clipboard.writeText as ReturnType<typeof vi.fn>
    expect(writeText).toHaveBeenCalledTimes(1)

    const href = writeText.mock.calls[0][0]
    const url = new URL(href)

    expect(url.pathname).toBe('/test')
    expect(url.searchParams.get('view')).toBe('preview')
    expect(url.searchParams.get('share')).toBeNull()
    expect(decodeMarkdownHash(url.hash)).toBe(longMarkdown)

    wrapper.unmount()
  })

  it('falls back to storage-backed preview share links for oversized markdown', async () => {
    const wrapper = await mountTestPage()
    const textarea = wrapper.get('textarea')
    const oversizedMarkdown = createOversizedMarkdown()

    expect(buildTestPageHref('/test', oversizedMarkdown, 'preview').length).toBeGreaterThan(10000)

    await textarea.setValue(oversizedMarkdown)
    await nextTick()
    await wrapper.get('[data-testid="preview-share-button"]').trigger('click')

    const writeText = navigator.clipboard.writeText as ReturnType<typeof vi.fn>
    expect(writeText).toHaveBeenCalledTimes(1)

    const href = writeText.mock.calls[0][0]
    const url = new URL(href)
    const shareId = url.searchParams.get('share')

    expect(url.pathname).toBe('/test')
    expect(url.searchParams.get('view')).toBe('preview')
    expect(url.hash).toBe('')
    expect(shareId).toBeTruthy()
    const storedShare = window.localStorage.getItem(`vmr-test-share:${shareId}`)
    expect(storedShare).toBeTruthy()
    expect(JSON.parse(storedShare!)).toMatchObject({
      content: oversizedMarkdown,
    })

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
    expect(wrapper.get('[data-testid="immersive-preview-back-button"]').text()).toContain('返回编辑')

    await wrapper.get('[data-testid="immersive-preview-back-button"]').trigger('click')
    await nextTick()

    expect(exitFullscreen).toHaveBeenCalledTimes(1)
    expect(button.text()).toContain('全屏预览')

    wrapper.unmount()
  })

  it('opens preview share links directly in preview-only mode', async () => {
    window.history.replaceState({}, '', buildTestPageHref('/test', '## shared only', 'preview'))

    const wrapper = await mountTestPage()

    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Cross-framework regression lab')
    expect(wrapper.get('[data-testid="preview"]').text()).toBe('## shared only')
    expect(wrapper.get('[data-testid="immersive-preview-back-button"]').text()).toContain('Test Page')
    expect(wrapper.get('[data-testid="immersive-preview-star-link"]').attributes('href')).toBe('https://github.com/Simon-He95/markstream-vue')

    await wrapper.get('[data-testid="immersive-preview-back-button"]').trigger('click')
    await nextTick()

    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(window.location.search).toBe('')
    expect(decodeMarkdownHash(window.location.hash)).toBe('## shared only')

    wrapper.unmount()
  })

  it('opens storage-backed preview links directly in preview-only mode', async () => {
    const longMarkdown = createLongMarkdown()
    const shareId = 'stored-preview'

    window.localStorage.setItem(`vmr-test-share:${shareId}`, longMarkdown)
    window.history.replaceState({}, '', `/test?view=preview&share=${shareId}`)

    const wrapper = await mountTestPage()

    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.get('[data-testid="preview"]').text()).toBe(longMarkdown)

    await wrapper.get('[data-testid="immersive-preview-back-button"]').trigger('click')
    await nextTick()

    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(window.location.search).toBe('')
    expect(decodeMarkdownHash(window.location.hash)).toBe(longMarkdown)

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

  it('toggles dark and light appearance from the immersive preview toolbar', async () => {
    window.history.replaceState({}, '', buildTestPageHref('/test', '## shared only', 'preview'))

    const wrapper = await mountTestPage()
    const page = wrapper.get('.test-lab')
    const button = wrapper.get('[data-testid="immersive-preview-theme-button"]')

    expect(page.classes()).not.toContain('test-lab--dark')
    expect(button.attributes('aria-label')).toBe('切换到暗色模式')

    await button.trigger('click')
    await nextTick()

    expect(page.classes()).toContain('test-lab--dark')
    expect(button.attributes('aria-label')).toBe('切换到浅色模式')

    wrapper.unmount()
  })
})
