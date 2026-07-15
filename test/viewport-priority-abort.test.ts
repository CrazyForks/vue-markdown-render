import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import { provideOffscreenHeavyNodeDeferral, useOffscreenHeavyNodeDeferral, waitForVisibilityOrAbort } from '../src/composables/viewportPriority'

describe('viewport priority abort', () => {
  it('releases a deferred render when its request is aborted before visibility', async () => {
    const controller = new AbortController()
    const waitingForVisibility = new Promise<void>(() => {})
    const waiting = waitForVisibilityOrAbort({
      isVisible: ref(false),
      whenVisible: waitingForVisibility,
      destroy: () => {},
    }, controller.signal)

    controller.abort()

    await expect(waiting).resolves.toBeUndefined()
  })

  it('allows a nested renderer to disable an ancestor heavy-node deferral setting', () => {
    const Grandchild = defineComponent({
      setup() {
        const enabled = useOffscreenHeavyNodeDeferral()
        return () => h('span', String(enabled.value))
      },
    })
    const Child = defineComponent({
      setup() {
        provideOffscreenHeavyNodeDeferral(computed(() => false))
        return () => h(Grandchild)
      },
    })
    const Parent = defineComponent({
      setup() {
        provideOffscreenHeavyNodeDeferral(computed(() => true))
        return () => h(Child)
      },
    })

    expect(mount(Parent).text()).toBe('false')
  })

  it('inherits an ancestor disabled heavy-node deferral setting when no nested value is provided', () => {
    const Child = defineComponent({
      setup() {
        const enabled = useOffscreenHeavyNodeDeferral()
        return () => h('span', String(enabled.value))
      },
    })
    const Parent = defineComponent({
      setup() {
        provideOffscreenHeavyNodeDeferral(computed(() => false))
        return () => h(Child)
      },
    })

    expect(mount(Parent).text()).toBe('false')
  })
})
