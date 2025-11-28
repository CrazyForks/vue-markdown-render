import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import MermaidBlockNode from '../src/components/MermaidBlockNode/MermaidBlockNode.vue'

describe('mermaid block export event', () => {
  it('emits export event with svgString when export button clicked', async () => {
    const node = {
      type: 'code_block',
      language: 'mermaid',
      code: 'graph LR\nA-->B\n',
      raw: '```mermaid\ngraph LR\nA-->B\n```',
    }

    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node,
        loading: false,
      },
      attachTo: document.body,
    })

    // Make the component think mermaid is available so the export button renders
    ;(wrapper.vm as any).mermaidAvailable = true

    // Populate the mermaid content area with an SVG so the export handler can find it
    const content = wrapper.find('div._mermaid')
    content.element.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><g></g></svg>'

    // Wait for DOM updates
    await nextTick()

    // Find the export button by matching the SVG path used in the template
    const buttons = wrapper.findAll('button')
    const exportBtn = buttons.find(b => b.html().includes('M12 15V3'))

    // Click the export button
    await exportBtn?.trigger('click')

    // The component emits the event object as the first (and only) arg
    const emitted = wrapper.emitted('export')
    expect(emitted).toBeTruthy()
    const ev = emitted?.[0]?.[0]
    expect(ev).toBeTruthy()
    expect(ev.svgString).toBeDefined()
    expect(typeof ev.svgString).toBe('string')
    expect(ev.svgString.length).toBeGreaterThan(0)
  })
})
