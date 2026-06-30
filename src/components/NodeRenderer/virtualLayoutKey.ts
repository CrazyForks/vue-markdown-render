import type { NodeRendererCodeRenderer, NodeRendererProps } from '../../types/node-renderer-props'
import { getHighlightRegistrationKey } from 'markstream-core'

export interface VirtualRendererLayoutKeyOptions {
  renderer: NodeRendererCodeRenderer
  isDark?: boolean
  codeBlockStream?: boolean
  codeBlockMinWidth?: NodeRendererProps['codeBlockMinWidth']
  codeBlockMaxWidth?: NodeRendererProps['codeBlockMaxWidth']
  codeBlockMonacoOptions?: NodeRendererProps['codeBlockMonacoOptions']
  codeBlockProps?: NodeRendererProps['codeBlockProps']
  themes?: NodeRendererProps['themes']
  langs?: NodeRendererProps['langs']
}

export function stringifyVirtualToken(value: unknown) {
  if (value == null)
    return ''

  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  }
  catch {
    return String(value)
  }
}

export function buildVirtualRendererLayoutKey(options: VirtualRendererLayoutKeyOptions) {
  const renderer = options.renderer
  const monaco = renderer === 'monaco' ? options.codeBlockMonacoOptions : undefined
  const codeProps = options.codeBlockProps as Record<string, unknown> | undefined
  const includeShikiCodeOptions = renderer === 'shiki'

  return [
    options.isDark ? 'dark' : 'light',
    renderer === 'monaco'
      ? 'code-rich'
      : renderer === 'pre'
        ? 'code-pre'
        : 'code-shiki',
    options.codeBlockStream === false ? 'code-static' : 'code-stream',
    stringifyVirtualToken(options.codeBlockMinWidth),
    stringifyVirtualToken(options.codeBlockMaxWidth),
    ...(includeShikiCodeOptions
      ? [getHighlightRegistrationKey(
          (codeProps?.themes ?? options.themes) as readonly unknown[] | undefined,
          (codeProps?.langs ?? options.langs) as readonly unknown[] | undefined,
        )]
      : []),
    stringifyVirtualToken(monaco?.fontSize),
    stringifyVirtualToken(monaco?.lineHeight),
    stringifyVirtualToken(monaco?.fontFamily),
    stringifyVirtualToken(monaco?.tabSize),
    stringifyVirtualToken(monaco?.MAX_HEIGHT),
    stringifyVirtualToken(monaco?.wordWrap),
    stringifyVirtualToken(monaco?.wrappingIndent),
    stringifyVirtualToken(monaco?.padding),
    stringifyVirtualToken(codeProps?.showHeader),
    stringifyVirtualToken(codeProps?.showCopyButton),
    stringifyVirtualToken(codeProps?.showExpandButton),
    stringifyVirtualToken(codeProps?.showPreviewButton),
    stringifyVirtualToken(codeProps?.showCollapseButton),
    stringifyVirtualToken(codeProps?.showFontSizeButtons),
  ].join('\u0000')
}

export function buildVirtualMeasurementKey(
  hostMeasurementKey: string | number | null | undefined,
  rendererLayoutKey: string,
) {
  return [
    hostMeasurementKey == null ? '' : String(hostMeasurementKey),
    rendererLayoutKey,
  ].join('\u0000')
}
