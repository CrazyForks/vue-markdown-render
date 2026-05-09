import type { SmoothMarkdownStreamOptions } from 'markstream-core'
import type { ComputedRef, Ref } from 'vue'
import { SmoothMarkdownStreamController as CoreController } from 'markstream-core'
import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'

export type { SmoothMarkdownStreamOptions }

export interface SmoothMarkdownStreamControllerVue {
  source: Ref<string>
  visible: Ref<string>
  done: Ref<boolean>
  final: ComputedRef<boolean>
  caughtUp: ComputedRef<boolean>
  pendingChars: ComputedRef<number>
  enqueue: (chunk: string) => void
  finish: (options?: { flush?: boolean }) => void
  flush: () => void
  reset: (initialMarkdown?: string) => void
  pause: () => void
  resume: () => void
}

/** @deprecated Use SmoothMarkdownStreamControllerVue for the Vue-specific interface, or SmoothMarkdownStreamController from markstream-core for the framework-agnostic class */
export type SmoothMarkdownStreamController = SmoothMarkdownStreamControllerVue

export function useSmoothMarkdownStream(options: SmoothMarkdownStreamOptions = {}): SmoothMarkdownStreamControllerVue {
  const source = ref('')
  const visible = ref('')
  const done = ref(false)

  const controller = new CoreController(options, (event) => {
    if (event === 'source')
      source.value = controller.source
    if (event === 'visible')
      visible.value = controller.visible
    if (event === 'done')
      done.value = controller.done
  })

  // Initialize refs from controller state
  source.value = controller.source
  visible.value = controller.visible
  done.value = controller.done

  const pendingChars = computed(() => Math.max(0, source.value.length - visible.value.length))
  const caughtUp = computed(() => pendingChars.value === 0)
  const final = computed(() => done.value && caughtUp.value)

  if (getCurrentScope())
    onScopeDispose(() => controller.destroy())

  return {
    source,
    visible,
    done,
    final,
    caughtUp,
    pendingChars,
    enqueue: (chunk: string) => controller.enqueue(chunk),
    finish: (finishOptions?: { flush?: boolean }) => controller.finish(finishOptions),
    flush: () => controller.flush(),
    reset: (initialMarkdown?: string) => {
      controller.reset(initialMarkdown)
      source.value = controller.source
      visible.value = controller.visible
      done.value = controller.done
    },
    pause: () => controller.pause(),
    resume: () => controller.resume(),
  }
}
