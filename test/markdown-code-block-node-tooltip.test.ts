import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import MarkdownCodeBlockNode from '../src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue'
import { hideTooltip } from '../src/composables/useSingletonTooltip'

function makeNode() {
  return {
    type: 'code_block' as const,
    language: 'plaintext',
    code: 'console.log(1)',
    raw: '```txt\nconsole.log(1)\n```',
  }
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitTooltipShow() {
  await wait(100)
  await nextTick()
}

describe('markdownCodeBlockNode tooltip toggles', () => {
  afterEach(async () => {
    hideTooltip(true)
    await nextTick()
  })

  it('renders action buttons with default tooltip settings', async () => {
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode(),
      },
    })

    const firstActionBtn = wrapper.find('button.code-action-btn')
    expect(firstActionBtn.exists()).toBe(true)

    wrapper.unmount()
  })

  it('does not show tooltip when showTooltips is false', async () => {
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode(),
        showTooltips: false,
      },
    })

    const firstActionBtn = wrapper.find('button.code-action-btn')
    expect(firstActionBtn.exists()).toBe(true)

    await firstActionBtn.trigger('focus', { clientX: 32, clientY: 24 })
    await waitTooltipShow()
    expect(firstActionBtn.attributes('aria-describedby')).toBeUndefined()

    wrapper.unmount()
  })

  it('disables tooltips when showTooltips is false', async () => {
    const wrapper = mount(MarkdownCodeBlockNode, {
      props: {
        loading: false,
        node: makeNode(),
        showTooltips: false,
      },
    })

    const firstActionBtn = wrapper.find('button.code-action-btn')
    await firstActionBtn.trigger('focus', { clientX: 28, clientY: 28 })
    await waitTooltipShow()
    expect(firstActionBtn.attributes('aria-describedby')).toBeUndefined()

    wrapper.unmount()
  })
})
