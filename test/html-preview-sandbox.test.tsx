import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
/* eslint-disable antfu/no-import-node-modules-by-path */
import React, { act } from '../packages/markstream-react/node_modules/react'
import { createRoot } from '../packages/markstream-react/node_modules/react-dom/client'
import ReactHtmlPreviewFrame from '../packages/markstream-react/src/components/CodeBlockNode/HtmlPreviewFrame'
import VueHtmlPreviewFrame from '../src/components/CodeBlockNode/HtmlPreviewFrame.vue'

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('html preview sandbox defaults', () => {
  it('keeps Vue 3 previews script-disabled by default and opt-in for scripts only', async () => {
    const wrapper = mount(VueHtmlPreviewFrame, {
      attachTo: document.body,
      props: { code: '<p>Preview</p>' },
    })

    const iframe = document.body.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute('sandbox')).toBe('')
    expect(iframe?.getAttribute('sandbox')).not.toContain('allow-scripts')
    expect(iframe?.getAttribute('sandbox')).not.toContain('allow-same-origin')

    await wrapper.setProps({ htmlPreviewAllowScripts: true })
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts')

    await wrapper.setProps({ htmlPreviewSandbox: 'allow-popups' })
    expect(iframe?.getAttribute('sandbox')).toBe('allow-popups')

    wrapper.unmount()
  })

  it('keeps Vue 2 previews script-disabled by default and opt-in for scripts only', () => {
    const componentSource = source('packages/markstream-vue2/src/components/CodeBlockNode/HtmlPreviewFrame.vue')
    expect(componentSource).toContain(':sandbox="sandboxValue"')
    expect(componentSource).toContain('return props.htmlPreviewAllowScripts ? \'allow-scripts\' : \'\'')
    expect(componentSource).toContain('return props.htmlPreviewSandbox')
    expect(componentSource).not.toContain('allow-scripts allow-same-origin')
  })

  it('keeps React previews script-disabled by default and opt-in for scripts only', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(ReactHtmlPreviewFrame, { code: '<p>Preview</p>' }))
    })
    await flushReact()

    const iframe = document.body.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute('sandbox')).toBe('')
    expect(iframe?.getAttribute('sandbox')).not.toContain('allow-scripts')
    expect(iframe?.getAttribute('sandbox')).not.toContain('allow-same-origin')

    await act(async () => {
      root.render(React.createElement(ReactHtmlPreviewFrame, {
        code: '<p>Preview</p>',
        htmlPreviewAllowScripts: true,
      }))
    })
    await flushReact()
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts')

    await act(async () => {
      root.render(React.createElement(ReactHtmlPreviewFrame, {
        code: '<p>Preview</p>',
        htmlPreviewSandbox: 'allow-popups',
      }))
    })
    await flushReact()
    expect(iframe?.getAttribute('sandbox')).toBe('allow-popups')

    await act(async () => {
      root.unmount()
    })
  })

  it('keeps Angular previews script-disabled by default and only enables requested sandbox tokens', () => {
    const componentSource = source('packages/markstream-angular/src/components/CodeBlockNode/HtmlPreviewFrame.component.ts')
    expect(componentSource).toContain('[attr.sandbox]="sandboxValue"')
    expect(componentSource).toContain('@Input() htmlPreviewAllowScripts = false')
    expect(componentSource).toContain('@Input() htmlPreviewSandbox?: string')
    expect(componentSource).toContain('return this.htmlPreviewAllowScripts ? \'allow-scripts\' : \'\'')
    expect(componentSource).not.toContain('allow-scripts allow-same-origin')
  })
})
