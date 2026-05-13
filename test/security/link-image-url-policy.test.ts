/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NodeRenderer from '../../src/components/NodeRenderer'
import { flushAll } from '../setup/flush-all'

describe('link and image URL policy', () => {
  it('omits unsafe href values from direct link nodes', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        typewriter: false,
        batchRendering: false,
        nodes: [
          {
            type: 'paragraph',
            raw: '',
            children: [
              {
                type: 'link',
                href: 'javascript:alert(1)',
                title: null,
                text: 'bad',
                raw: '[bad](javascript:alert(1))',
                children: [{ type: 'text', content: 'bad', raw: 'bad' }],
              },
            ],
          },
        ],
      },
    })

    await flushAll()
    expect(wrapper.get('a.link-node').attributes('href')).toBeUndefined()
  })

  it('does not render unsafe direct image node URLs', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        typewriter: false,
        batchRendering: false,
        nodes: [
          {
            type: 'paragraph',
            raw: '',
            children: [
              {
                type: 'image',
                src: 'javascript:alert(1)',
                alt: 'bad',
                title: null,
                raw: '![bad](javascript:alert(1))',
                loading: false,
              },
            ],
          },
        ],
      },
    })

    await flushAll()
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('keeps safe direct image node URLs', async () => {
    const src = 'data:image/png;base64,iVBORw0KGgo='
    const wrapper = mount(NodeRenderer, {
      props: {
        typewriter: false,
        batchRendering: false,
        nodes: [
          {
            type: 'paragraph',
            raw: '',
            children: [
              {
                type: 'image',
                src,
                alt: 'ok',
                title: null,
                raw: '![ok](data:image/png;base64,iVBORw0KGgo=)',
                loading: false,
              },
            ],
          },
        ],
      },
    })

    await flushAll()
    expect(wrapper.get('img').attributes('src')).toBe(src)
  })
})
