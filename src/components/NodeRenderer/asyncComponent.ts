import type { Component, ComponentPublicInstance } from 'vue'
import type {
  CodeBlockNodeProps,
  MathBlockNodeProps,
  MathInlineNodeProps,
} from '../../types/component-props'
import { defineAsyncComponent, defineComponent, getCurrentInstance, h, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useOffscreenHeavyNodeDeferral, useViewportPriority, useViewportPriorityOptions } from '../../composables/viewportPriority'
import { languageMap, normalizeLanguageIdentifier } from '../../utils'
import {
  isDiffCodeBlock,
  resolveCodeBlockHeader,
  resolveDiffHideUnchangedRegionsOption,
  resolveDiffInlineLayout,
} from '../CodeBlockNode/codeBlockHeader'
import { getKatex } from '../MathInlineNode/katex'
import PreCodeNode from '../PreCodeNode'
import TextNode from '../TextNode'

interface ProcessLike {
  env?: {
    NODE_ENV?: string
  }
}

type CodeBlockFallbackProps = CodeBlockNodeProps & Record<string, unknown>
type MathInlineFallbackProps = MathInlineNodeProps & Record<string, unknown>
type MathBlockFallbackProps = MathBlockNodeProps & Record<string, unknown>

function getProcessEnv() {
  const processValue = Reflect.get(globalThis, 'process') as ProcessLike | undefined
  return processValue?.env
}

export function withViewportDeferredLoading(name: string, component: Component, loadingComponent: Component) {
  return defineComponent({
    name,
    inheritAttrs: false,
    setup(_props, { attrs, slots }) {
      const registerViewport = useViewportPriority()
      const viewportPriorityOptions = useViewportPriorityOptions()
      const offscreenHeavyNodeDeferral = useOffscreenHeavyNodeDeferral()
      const hydratedFromServer = typeof window !== 'undefined' && getCurrentInstance()?.vnode.el?.nodeType === 1
      const viewportReady = ref(
        typeof window === 'undefined'
        || hydratedFromServer
        || !offscreenHeavyNodeDeferral.value,
      )
      const target = shallowRef<HTMLElement | null>(null)
      let viewportHandle: ReturnType<typeof registerViewport> | null = null

      function setTarget(value: Element | ComponentPublicInstance | null) {
        const element = value && '$el' in value ? value.$el : value
        target.value = element instanceof HTMLElement ? element : null
      }

      if (typeof window !== 'undefined') {
        watch(
          [target, offscreenHeavyNodeDeferral],
          ([element, shouldDefer], _previous, onCleanup) => {
            viewportHandle?.destroy()
            viewportHandle = null

            if (!shouldDefer || viewportReady.value) {
              viewportReady.value = true
              return
            }
            if (!element)
              return

            let active = true
            const handle = registerViewport(element, {
              rootMargin: viewportPriorityOptions?.value.heavyBlockMargin,
              allowIdle: false,
            })
            viewportHandle = handle
            viewportReady.value = handle.isVisible.value
            handle.whenVisible.then(() => {
              if (active && viewportHandle === handle)
                viewportReady.value = true
            })

            onCleanup(() => {
              active = false
              handle.destroy()
              if (viewportHandle === handle)
                viewportHandle = null
            })
          },
          { immediate: true },
        )
      }

      onBeforeUnmount(() => {
        viewportHandle?.destroy()
        viewportHandle = null
      })

      return () => h(
        viewportReady.value ? component : loadingComponent,
        { ...attrs, ref: setTarget },
        slots,
      )
    },
  })
}

export const CodeBlockNodeLoading = defineComponent({
  name: 'CodeBlockNodeLoading',
  inheritAttrs: false,
  props: [
    'node',
    'isDark',
    'loading',
    'stream',
    'theme',
    'darkTheme',
    'lightTheme',
    'isShowPreview',
    'monacoOptions',
    'enableFontSizeControl',
    'minWidth',
    'maxWidth',
    'themes',
    'showHeader',
    'showCopyButton',
    'showExpandButton',
    'showPreviewButton',
    'showCollapseButton',
    'showFontSizeButtons',
    'showTooltips',
    'htmlPreviewAllowScripts',
    'htmlPreviewSandbox',
    'customId',
    'estimatedHeightPx',
    'estimatedContentHeightPx',
    'estimatedDiffInline',
  ],
  emits: ['previewCode', 'copy'],
  setup(rawProps, { attrs }) {
    const props = rawProps as CodeBlockFallbackProps & {
      estimatedHeightPx?: number
      estimatedContentHeightPx?: number
      estimatedDiffInline?: boolean
    }

    return () => {
      const language = normalizeLanguageIdentifier(String(props.node?.language ?? ''))
      const displayLanguage = languageMap[language]
        || (language ? language.charAt(0).toUpperCase() + language.slice(1) : languageMap[''])
      const isDiff = isDiffCodeBlock(props.node)
      const header = resolveCodeBlockHeader(
        String(props.node?.raw ?? ''),
        displayLanguage,
        isDiff,
      )
      const monacoOptions = props.monacoOptions
      const diffInline = isDiff && (props.estimatedDiffInline
        ?? resolveDiffInlineLayout(monacoOptions ?? {}, typeof window === 'undefined' ? 0 : window.innerWidth))
      const diffAppearance = monacoOptions?.diffAppearance
      const isSurfaceDark = diffAppearance === 'dark'
        || (diffAppearance !== 'light' && props.isDark === true)
      const fontSize = typeof monacoOptions?.fontSize === 'number' && Number.isFinite(monacoOptions.fontSize) && monacoOptions.fontSize > 0
        ? monacoOptions.fontSize
        : 12
      const lineHeight = typeof monacoOptions?.lineHeight === 'number' && Number.isFinite(monacoOptions.lineHeight) && monacoOptions.lineHeight > 0
        ? monacoOptions.lineHeight
        : fontSize === 12 ? 18 : Math.max(12, Math.round(fontSize * 1.5))
      const tabSize = typeof monacoOptions?.tabSize === 'number' && Number.isFinite(monacoOptions.tabSize) && monacoOptions.tabSize > 0
        ? monacoOptions.tabSize
        : 4
      const defaultPadding = isDiff ? 0 : 8
      const paddingTop = typeof monacoOptions?.padding?.top === 'number' && Number.isFinite(monacoOptions.padding.top) && monacoOptions.padding.top >= 0
        ? monacoOptions.padding.top
        : defaultPadding
      const paddingBottom = typeof monacoOptions?.padding?.bottom === 'number' && Number.isFinite(monacoOptions.padding.bottom) && monacoOptions.padding.bottom >= 0
        ? monacoOptions.padding.bottom
        : defaultPadding
      const fontFamily = typeof monacoOptions?.fontFamily === 'string' ? monacoOptions.fontFamily.trim() : ''
      const preStyle = {
        'fontSize': `${fontSize}px`,
        'lineHeight': `${lineHeight}px`,
        'tabSize': tabSize,
        'paddingTop': `${paddingTop}px`,
        'paddingBottom': `${paddingBottom}px`,
        '--markstream-pre-line-number-top': `${paddingTop}px`,
        ...(isDiff ? { '--markstream-pre-diff-line-height': `${lineHeight}px` } : {}),
        ...(fontFamily ? { '--markstream-code-font-family': fontFamily } : {}),
      }
      const actionPlaceholder = () => h('button', {
        'class': 'code-action-btn inline-flex items-center justify-center p-[var(--ms-action-btn-padding)] rounded leading-none shrink-0',
        'aria-hidden': 'true',
        'disabled': true,
        'tabindex': -1,
        'type': 'button',
      }, [h('svg', { class: 'action-icon' })])
      const isPreviewable = props.isShowPreview !== false && (language === 'html' || language === 'svg')
      const showOverflowPlaceholder = (props.showFontSizeButtons !== false && props.enableFontSizeControl !== false)
        || props.showExpandButton !== false
        || (isPreviewable && props.showPreviewButton !== false)
      const formatSize = (value: unknown) => {
        if (value == null)
          return undefined
        return typeof value === 'number' ? `${value}px` : String(value)
      }
      const containerStyle = {
        '--markstream-code-layout-character-width': '1ch',
        ...(formatSize(props.minWidth) ? { minWidth: formatSize(props.minWidth) } : {}),
        ...(formatSize(props.maxWidth) ? { maxWidth: formatSize(props.maxWidth) } : {}),
        ...(!isDiff
          ? {
              color: 'var(--vscode-editor-foreground, var(--markstream-code-fallback-fg))',
              backgroundColor: 'var(--vscode-editor-background, var(--markstream-code-fallback-bg))',
              borderColor: 'var(--markstream-code-border-color)',
            }
          : {}),
      }
      return h('div', {
        ...attrs,
        'class': [
          'code-block-container',
          'rounded-lg',
          'border',
          {
            'dark': props.isDark === true,
            'is-rendering': props.loading !== false,
            'is-dark': isSurfaceDark,
            'is-diff': isDiff,
            'is-plain-text': language === '' || language === 'plaintext' || language === 'text',
          },
          attrs.class,
        ],
        'style': [containerStyle, attrs.style],
        'data-markstream-code-block': '1',
        'data-markstream-enhanced': 'false',
        'data-markstream-code-block-state': props.loading ? 'streaming' : 'settled',
        'data-markstream-code-loading': '1',
      }, [
        props.showHeader === false
          ? null
          : h('div', {
              class: 'code-block-header flex justify-between items-center border-b px-[var(--ms-inset-panel-x)] py-[var(--ms-inset-panel-y)] border-[var(--code-border)] bg-[var(--code-header-bg)] text-[var(--code-fg)]',
            }, [
              h('div', { class: 'code-header-main' }, [
                h('span', { class: 'icon-slot h-4 w-4 flex-shrink-0' }),
                h('div', { class: 'code-header-copy' }, [
                  h('div', { class: 'code-header-title' }, header.title),
                  header.caption
                    ? h('div', { class: 'code-header-caption' }, header.caption)
                    : null,
                ]),
              ]),
              h('div', {
                class: 'flex items-center gap-0.5',
                style: { visibility: 'hidden' },
              }, [
                isDiff
                  ? h('div', { 'class': 'code-diff-stats', 'aria-hidden': 'true' }, [
                      h('span', { class: 'code-diff-stat removed' }, '-0'),
                      h('span', { class: 'code-diff-stat added' }, '+0'),
                    ])
                  : null,
                props.showCopyButton === false ? null : actionPlaceholder(),
                props.showCollapseButton === false ? null : actionPlaceholder(),
                showOverflowPlaceholder
                  ? h('div', { class: 'relative' }, [actionPlaceholder()])
                  : null,
              ]),
            ]),
        h('div', {
          class: 'code-block-shell-content',
          style: props.stream !== false || props.loading === false ? undefined : { display: 'none' },
        }, [
          h(PreCodeNode, {
            'node': props.node,
            'loading': props.loading,
            'showLineNumbers': true,
            'reservedHeightPx': isDiff ? undefined : props.estimatedContentHeightPx,
            'diffInline': diffInline,
            'diffHideUnchangedRegions': isDiff
              ? resolveDiffHideUnchangedRegionsOption(monacoOptions?.diffHideUnchangedRegions)
              : undefined,
            'class': 'code-pre-fallback',
            'style': preStyle,
            'data-markstream-code-loading': '1',
          }),
        ]),
        h('div', {
          class: 'code-loading-placeholder',
          style: props.stream === false && props.loading !== false ? undefined : { display: 'none' },
        }, [
          h('div', { class: 'loading-skeleton' }, [
            h('div', { class: 'skeleton-line' }),
            h('div', { class: 'skeleton-line' }),
            h('div', { class: 'skeleton-line short' }),
          ]),
        ]),
        h('span', { 'class': 'sr-only', 'aria-live': 'polite', 'role': 'status' }),
      ])
    }
  },
})

const CodeBlockNodeInnerAsync = defineAsyncComponent({
  loader: async () => {
    try {
      const mod = await import('../../components/CodeBlockNode/CodeBlockNode.vue')
      return mod.default
    }
    catch (e) {
      console.warn(
        '[markstream-vue] Optional peer dependency stream-diffs is missing. Falling back to preformatted code rendering. To enable enhanced code block features, please install "stream-diffs".',
        e,
      )
      return PreCodeNode
    }
  },
  loadingComponent: CodeBlockNodeLoading,
  delay: 0,
  suspensible: false,
})

export const CodeBlockNodeAsync = withViewportDeferredLoading(
  'ViewportDeferredCodeBlockNode',
  CodeBlockNodeInnerAsync,
  CodeBlockNodeLoading,
)

export const MathInlineNodeAsync = defineAsyncComponent(async () => {
  // In test environment prefer the simple text fallback to avoid
  // race conditions with workers/KaTeX rendering.
  const isTestEnv = getProcessEnv()?.NODE_ENV === 'test'
  if (isTestEnv && typeof window !== 'undefined') {
    return (props: MathInlineFallbackProps) => {
      // test fallback should be deterministic and minimal
      return h(TextNode, {
        ...props,
        node: {
          type: 'text',
          content: props.node.raw ?? `$${props.node.content ?? ''}$`,
          raw: props.node.raw ?? `$${props.node.content ?? ''}$`,
        },
      })
    }
  }

  try {
    await getKatex()
    const mod = await import('../../components/MathInlineNode')
    return mod.default
  }
  catch (e) {
    console.warn(
      '[markstream-vue] Optional peer dependencies for MathInlineNode are missing. Falling back to text rendering. To enable full math rendering features, please install "katex".',
      e,
    )
  }
  return (props: MathInlineFallbackProps) => {
    return h(TextNode, {
      ...props,
      node: {
        type: 'text',
        content: props.node.raw ?? `$${props.node.content ?? ''}$`,
        raw: props.node.raw ?? `$${props.node.content ?? ''}$`,
      },
    })
  }
})

export const MathBlockNodeAsync = defineAsyncComponent(async () => {
  try {
    await getKatex()
    const mod = await import('../../components/MathBlockNode')
    return mod.default
  }
  catch (e) {
    console.warn(
      '[markstream-vue] Optional peer dependencies for MathBlockNode are missing. Falling back to text rendering. To enable full math rendering features, please install "katex".',
      e,
    )
  }
  return (props: MathBlockFallbackProps) => {
    return h(TextNode, {
      ...props,
      node: {
        type: 'text',
        content: props.node.raw ?? `$$${props.node.content ?? ''}$$`,
        raw: props.node.raw ?? `$$${props.node.content ?? ''}$$`,
      },
    })
  }
})
