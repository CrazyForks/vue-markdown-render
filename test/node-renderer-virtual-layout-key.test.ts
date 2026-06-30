import { describe, expect, it } from 'vitest'
import {
  buildVirtualMeasurementKey,
  buildVirtualRendererLayoutKey,
  stringifyVirtualToken,
} from '../src/components/NodeRenderer/virtualLayoutKey'

describe('virtual layout key helpers', () => {
  it('serializes virtual tokens the same way as the renderer metrics path', () => {
    expect(stringifyVirtualToken(null)).toBe('')
    expect(stringifyVirtualToken(undefined)).toBe('')
    expect(stringifyVirtualToken(false)).toBe('false')
    expect(stringifyVirtualToken(12)).toBe('12')
    expect(stringifyVirtualToken({ width: 320 })).toBe('{"width":320}')

    const circular: Record<string, unknown> = {}
    circular.self = circular

    expect(stringifyVirtualToken(circular)).toBe('[object Object]')
  })

  it('combines host and renderer layout keys without dropping empty host keys', () => {
    const layoutKey = buildVirtualRendererLayoutKey({
      renderer: 'monaco',
      isDark: false,
      codeBlockStream: true,
    })

    expect(buildVirtualMeasurementKey(undefined, layoutKey)).toBe(`\u0000${layoutKey}`)
    expect(buildVirtualMeasurementKey('host-theme', layoutKey)).toBe(`host-theme\u0000${layoutKey}`)
    expect(buildVirtualMeasurementKey(42, layoutKey)).toBe(`42\u0000${layoutKey}`)
  })

  it('tracks renderer mode, theme, stream, and code block sizing dimensions', () => {
    const base = buildVirtualRendererLayoutKey({
      renderer: 'monaco',
      isDark: false,
      codeBlockStream: true,
      codeBlockMinWidth: 320,
      codeBlockMaxWidth: '100%',
    })

    expect(base).toContain('light')
    expect(base).toContain('code-rich')
    expect(base).toContain('code-stream')
    expect(base).toContain('320')
    expect(base).toContain('100%')

    expect(buildVirtualRendererLayoutKey({
      renderer: 'pre',
      isDark: false,
      codeBlockStream: true,
      codeBlockMinWidth: 320,
      codeBlockMaxWidth: '100%',
    })).not.toBe(base)

    expect(buildVirtualRendererLayoutKey({
      renderer: 'monaco',
      isDark: true,
      codeBlockStream: true,
      codeBlockMinWidth: 320,
      codeBlockMaxWidth: '100%',
    })).not.toBe(base)

    expect(buildVirtualRendererLayoutKey({
      renderer: 'monaco',
      isDark: false,
      codeBlockStream: false,
      codeBlockMinWidth: 320,
      codeBlockMaxWidth: '100%',
    })).not.toBe(base)
  })

  it('includes monaco options only for monaco renderer layout keys', () => {
    const preBase = buildVirtualRendererLayoutKey({
      renderer: 'pre',
      codeBlockMonacoOptions: {
        fontSize: 14,
        lineHeight: 20,
      },
    })
    const preChanged = buildVirtualRendererLayoutKey({
      renderer: 'pre',
      codeBlockMonacoOptions: {
        fontSize: 18,
        lineHeight: 28,
      },
    })

    expect(preChanged).toBe(preBase)

    const monacoBase = buildVirtualRendererLayoutKey({
      renderer: 'monaco',
      codeBlockMonacoOptions: {
        fontSize: 14,
        lineHeight: 20,
      },
    })
    const monacoChanged = buildVirtualRendererLayoutKey({
      renderer: 'monaco',
      codeBlockMonacoOptions: {
        fontSize: 18,
        lineHeight: 28,
      },
    })

    expect(monacoChanged).not.toBe(monacoBase)
  })

  it('normalizes shiki language options and honors codeBlockProps overrides', () => {
    const shorthand = buildVirtualRendererLayoutKey({
      renderer: 'shiki',
      themes: ['vitesse-light'],
      langs: ['ts', 'js'],
    })
    const normalized = buildVirtualRendererLayoutKey({
      renderer: 'shiki',
      themes: ['vitesse-light'],
      langs: ['javascript', 'typescript'],
    })

    expect(shorthand).toBe(normalized)
    expect(shorthand).toContain('javascript')
    expect(shorthand).toContain('typescript')

    const overridden = buildVirtualRendererLayoutKey({
      renderer: 'shiki',
      themes: ['vitesse-light'],
      langs: ['typescript'],
      codeBlockProps: {
        themes: ['github-light'],
        langs: ['python'],
      },
    })

    expect(overridden).toContain('github-light')
    expect(overridden).toContain('python')
    expect(overridden).not.toBe(shorthand)
  })

  it('tracks code block chrome options that can affect layout', () => {
    const base = buildVirtualRendererLayoutKey({
      renderer: 'monaco',
      codeBlockProps: {
        showHeader: true,
        showCopyButton: true,
      },
    })

    expect(buildVirtualRendererLayoutKey({
      renderer: 'monaco',
      codeBlockProps: {
        showHeader: false,
        showCopyButton: true,
      },
    })).not.toBe(base)

    expect(buildVirtualRendererLayoutKey({
      renderer: 'monaco',
      codeBlockProps: {
        showHeader: true,
        showCopyButton: false,
      },
    })).not.toBe(base)
  })
})
