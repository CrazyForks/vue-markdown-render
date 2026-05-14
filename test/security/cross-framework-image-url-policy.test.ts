/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderMarkdownNodeToHtml as renderAngularNodeToHtml } from '../../packages/markstream-angular/src/renderMarkdownHtml'
import { ImageNode as ReactImageNode } from '../../packages/markstream-react/src/components/ImageNode/ImageNode'
import { ImageNode as ReactServerImageNode } from '../../packages/markstream-react/src/server-renderer'
import { renderMarkdownNodeToHtml as renderSvelteNodeToHtml } from '../../packages/markstream-svelte/src/renderMarkdownHtml'
import { renderMarkdownNodeToHtml as renderVue2NodeToHtml } from '../../packages/markstream-vue2/src/utils/nestedHtml'
import VueImageNode from '../../src/components/ImageNode/ImageNode.vue'

function imageNode(src: string) {
  return {
    type: 'image',
    src,
    alt: 'x',
    title: null,
    raw: `![x](${src})`,
    loading: false,
  } as any
}

describe('cross-framework image URL policy', () => {
  it('omits unsafe image URLs in static framework renderers', () => {
    const unsafe = [
      'javascript:alert(1)',
      'data:image/svg+xml,<svg onload=alert(1)>',
      'blob:https://example.com/abc',
      '//evil.example/x.png',
    ]

    for (const src of unsafe) {
      const node = imageNode(src)
      expect(renderVue2NodeToHtml(node)).not.toContain('<img')
      expect(renderSvelteNodeToHtml(node)).not.toContain('<img')
      expect(renderAngularNodeToHtml(node)).not.toContain('<img')
      expect(renderToStaticMarkup(React.createElement(ReactServerImageNode as any, { node }))).not.toContain('<img')
      expect(renderToStaticMarkup(React.createElement(ReactImageNode as any, { node, lazy: false }))).not.toContain('<img')
    }
  })

  it('omits unsafe image URLs in the Vue 3 ImageNode component path', () => {
    const unsafe = [
      'javascript:alert(1)',
      'data:image/svg+xml,<svg onload=alert(1)>',
      'blob:https://example.com/abc',
      '//evil.example/x.png',
    ]

    for (const src of unsafe) {
      const wrapper = mount(VueImageNode as any, {
        props: {
          node: imageNode(src),
          lazy: false,
        },
      })

      expect(wrapper.find('img').exists()).toBe(false)
      wrapper.unmount()
    }
  })

  it('keeps raster data images in static framework renderers', () => {
    const node = imageNode('data:image/png;base64,iVBORw0KGgo=')

    expect(renderVue2NodeToHtml(node)).toContain('<img')
    expect(renderSvelteNodeToHtml(node)).toContain('<img')
    expect(renderAngularNodeToHtml(node)).toContain('<img')
    expect(renderToStaticMarkup(React.createElement(ReactServerImageNode as any, { node }))).toContain('<img')
    expect(renderToStaticMarkup(React.createElement(ReactImageNode as any, { node, lazy: false }))).toContain('<img')
  })
})
