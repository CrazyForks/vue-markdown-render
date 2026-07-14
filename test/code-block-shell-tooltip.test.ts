import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import CodeBlockShell from '../src/components/CodeBlockNode/CodeBlockShell.vue'
import { hideTooltip } from '../src/composables/useSingletonTooltip'

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitTooltipShow() {
  await wait(100)
  await vi.dynamicImportSettled()
  await nextTick()
}

describe('codeBlockShell overflow menu tooltip', () => {
  afterEach(async () => {
    hideTooltip(true)
    await nextTick()
  })

  it('clears the singleton tooltip when a menu item closes the overflow menu', async () => {
    const wrapper = mount(CodeBlockShell, {
      attachTo: document.body,
      props: {
        showCollapseButton: false,
        showCopyButton: false,
        showExpandButton: false,
        showFontSizeButtons: false,
        isPreviewable: true,
      },
    })

    const moreButton = wrapper.get('button[aria-haspopup="true"]')

    await moreButton.trigger('mouseenter')
    await waitTooltipShow()
    expect(moreButton.attributes('aria-describedby')).toBeDefined()

    await moreButton.trigger('click')
    await nextTick()

    const previewButton = wrapper.findAll('button[role="menuitem"]').find(button => button.text().includes('Preview'))
    expect(previewButton).toBeTruthy()

    await previewButton!.trigger('click')
    await nextTick()

    expect(wrapper.emitted('preview')).toHaveLength(1)
    expect(moreButton.attributes('aria-describedby')).toBeUndefined()
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('does not expose a removed expand menu item as a tooltip anchor', async () => {
    const wrapper = mount(CodeBlockShell, {
      attachTo: document.body,
      props: {
        showCollapseButton: false,
        showCopyButton: false,
        showExpandButton: true,
        showFontSizeButtons: false,
        isPreviewable: false,
      },
    })

    await wrapper.get('button[aria-haspopup="true"]').trigger('click')
    await nextTick()

    const expandButton = wrapper.get('button[role="menuitem"]')
    const expandElement = expandButton.element as HTMLElement
    await expandButton.trigger('click')
    await nextTick()

    expect(expandElement.isConnected).toBe(false)
    expect(wrapper.emitted('toggleExpand')).toEqual([[]])

    wrapper.unmount()
  })
})
