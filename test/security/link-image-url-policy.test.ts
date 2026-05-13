/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import ImageNode from '../../src/components/ImageNode/ImageNode.vue'
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

  it('rejects SVG data URLs for direct image nodes', async () => {
    const src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'
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
                alt: 'bad',
                title: null,
                raw: `![bad](${src})`,
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

  it('shows error instead of blank when fallbackSrc is unsafe', async () => {
    const wrapper = mount(ImageNode, {
      props: {
        node: {
          type: 'image',
          src: 'https://example.com/missing.png',
          alt: 'x',
          title: null,
          raw: '![x](https://example.com/missing.png)',
          loading: false,
        },
        fallbackSrc: 'javascript:alert(1)',
      },
    })

    await wrapper.get('img').trigger('error')
    await nextTick()

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.image-error').exists()).toBe(true)
  })

  it('renders safe fallback when primary image fails', async () => {
    const wrapper = mount(ImageNode, {
      props: {
        node: {
          type: 'image',
          src: 'https://example.com/broken.png',
          alt: 'x',
          title: null,
          raw: '![x](https://example.com/broken.png)',
          loading: false,
        },
        fallbackSrc: 'https://example.com/fallback.png',
      },
    })

    await wrapper.get('img').trigger('error')
    await nextTick()

    expect(wrapper.get('img').attributes('src')).toBe('https://example.com/fallback.png')
    expect(wrapper.find('.image-error').exists()).toBe(false)
  })

  it('shows error after fallback image also fails', async () => {
    const wrapper = mount(ImageNode, {
      props: {
        node: {
          type: 'image',
          src: 'https://example.com/broken.png',
          alt: 'x',
          title: null,
          raw: '![x](https://example.com/broken.png)',
          loading: false,
        },
        fallbackSrc: 'https://example.com/fallback.png',
      },
    })

    await wrapper.get('img').trigger('error')
    await nextTick()
    await wrapper.get('img').trigger('error')
    await nextTick()

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.image-error').exists()).toBe(true)
  })

  it('resets to primary image when node src changes', async () => {
    const wrapper = mount(ImageNode, {
      props: {
        node: {
          type: 'image',
          src: 'https://example.com/broken.png',
          alt: 'x',
          title: null,
          raw: '![x](https://example.com/broken.png)',
          loading: false,
        },
        fallbackSrc: 'https://example.com/fallback.png',
      },
    })

    await wrapper.get('img').trigger('error')
    await nextTick()
    await wrapper.setProps({
      node: {
        type: 'image',
        src: 'https://example.com/next.png',
        alt: 'x',
        title: null,
        raw: '![x](https://example.com/next.png)',
        loading: false,
      },
      fallbackSrc: 'https://example.com/fallback.png',
    })
    await nextTick()

    expect(wrapper.get('img').attributes('src')).toBe('https://example.com/next.png')
    expect(wrapper.find('.image-error').exists()).toBe(false)
  })
})
