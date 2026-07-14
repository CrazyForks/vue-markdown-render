import type { Component, ComponentPublicInstance } from 'vue'
import type {
  CodeBlockNodeProps,
  MathBlockNodeProps,
  MathInlineNodeProps,
} from '../../types/component-props'
import { defineAsyncComponent, defineComponent, getCurrentInstance, h, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useOffscreenHeavyNodeDeferral, useViewportPriority, useViewportPriorityOptions } from '../../composables/viewportPriority'
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

function shouldAwaitKatexLoader() {
  return typeof window === 'undefined'
    || document.querySelector('[data-markstream-math][data-markstream-mode="katex"]') !== null
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
  setup(_props, { attrs }) {
    const props = attrs as CodeBlockFallbackProps & {
      estimatedHeightPx?: number
      estimatedContentHeightPx?: number
    }

    return () => h(PreCodeNode, {
      ...attrs,
      'node': props.node,
      'showLineNumbers': true,
      'reservedHeightPx': props.estimatedHeightPx ?? props.estimatedContentHeightPx,
      'class': ['code-pre-fallback', attrs.class],
      'data-markstream-code-block': '1',
      'data-markstream-enhanced': 'false',
      'data-markstream-code-block-state': props.loading ? 'streaming' : 'settled',
      'data-markstream-code-loading': '1',
    })
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

const MathInlineNodeLoading = defineComponent({
  name: 'MathInlineNodeLoading',
  inheritAttrs: false,
  setup(_props, { attrs }) {
    const props = attrs as MathInlineFallbackProps
    return () => h('span', {
      'class': 'math-inline math-inline--fallback',
      'data-markstream-math': 'inline',
      'data-markstream-mode': 'fallback',
    }, props.node.raw ?? `$${props.node.content ?? ''}$`)
  },
})

const MathInlineNodeInnerAsync = defineAsyncComponent(async () => {
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
    if (shouldAwaitKatexLoader())
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

export const MathInlineNodeAsync = withViewportDeferredLoading(
  'ViewportDeferredMathInlineNode',
  MathInlineNodeInnerAsync,
  MathInlineNodeLoading,
)

const MathBlockNodeLoading = defineComponent({
  name: 'MathBlockNodeLoading',
  inheritAttrs: false,
  setup(_props, { attrs }) {
    const props = attrs as MathBlockFallbackProps
    return () => h('pre', {
      'class': 'math-block__fallback text-left',
      'data-markstream-math': 'block',
      'data-markstream-mode': 'fallback',
    }, props.node.raw ?? `$$${props.node.content ?? ''}$$`)
  },
})

const MathBlockNodeInnerAsync = defineAsyncComponent(async () => {
  try {
    if (shouldAwaitKatexLoader())
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

export const MathBlockNodeAsync = withViewportDeferredLoading(
  'ViewportDeferredMathBlockNode',
  MathBlockNodeInnerAsync,
  MathBlockNodeLoading,
)
