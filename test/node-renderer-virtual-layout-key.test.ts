import { getHighlightRegistrationKey } from 'markstream-core'
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

  it('preserves the exact monaco layout key token sequence', () => {
    const key = buildVirtualRendererLayoutKey({
      renderer: 'monaco',
      isDark: true,
      codeBlockStream: false,
      codeBlockMinWidth: 320,
      codeBlockMaxWidth: '100%',
      codeBlockMonacoOptions: {
        fontSize: 14,
        lineHeight: 20,
        fontFamily: 'JetBrains Mono',
        tabSize: 2,
        MAX_HEIGHT: 560,
        wordWrap: 'on',
        wrappingIndent: 'same',
        padding: { top: 12, bottom: 16 },
      },
      codeBlockProps: {
        showHeader: true,
        showCopyButton: false,
        showExpandButton: true,
        showPreviewButton: false,
        showCollapseButton: true,
        showFontSizeButtons: false,
      },
    })

    expect(key).toBe([
      'dark',
      'code-rich',
      'code-static',
      '320',
      '100%',
      '14',
      '20',
      'JetBrains Mono',
      '2',
      '560',
      'on',
      'same',
      '{"top":12,"bottom":16}',
      'true',
      'false',
      'true',
      'false',
      'true',
      'false',
    ].join('\u0000'))
  })

  it('preserves the exact shiki layout key token sequence', () => {
    const registrationKey = getHighlightRegistrationKey(['github-light'], ['typescript'])
    const key = buildVirtualRendererLayoutKey({
      renderer: 'shiki',
      isDark: false,
      codeBlockStream: true,
      codeBlockMinWidth: '16rem',
      codeBlockMaxWidth: 960,
      codeBlockMonacoOptions: {
        fontSize: 18,
        lineHeight: 28,
      },
      themes: ['vitesse-light'],
      langs: ['javascript'],
      codeBlockProps: {
        themes: ['github-light'],
        langs: ['ts'],
        showHeader: false,
        showCopyButton: true,
        showExpandButton: false,
        showPreviewButton: true,
        showCollapseButton: false,
        showFontSizeButtons: true,
      },
    })

    expect(key).toBe([
      'light',
      'code-shiki',
      'code-stream',
      '16rem',
      '960',
      registrationKey,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'false',
      'true',
      'false',
      'true',
      'false',
      'true',
    ].join('\u0000'))
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
