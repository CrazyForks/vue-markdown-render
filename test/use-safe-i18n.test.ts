import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { useSafeI18n } from '../src/composables/useSafeI18n'

const TestComponent = defineComponent({
  setup() {
    const { t } = useSafeI18n()
    return { t }
  },
  template: '<span>{{ t("common.copy") }}</span>',
})

const originalVueI18nUse = (globalThis as any).$vueI18nUse

afterEach(() => {
  if (originalVueI18nUse === undefined)
    delete (globalThis as any).$vueI18nUse
  else
    (globalThis as any).$vueI18nUse = originalVueI18nUse
})

describe('useSafeI18n', () => {
  it('prefers the current app translator without mutating globalThis', () => {
    delete (globalThis as any).$vueI18nUse
    const appT = vi.fn((key: string) => key === 'common.copy' ? 'Kopieren' : key)

    const wrapper = mount(TestComponent, {
      global: {
        config: {
          globalProperties: {
            $t: appT,
          },
        },
      },
    })

    expect(wrapper.text()).toBe('Kopieren')
    expect(appT).toHaveBeenCalledWith('common.copy')
    expect((globalThis as any).$vueI18nUse).toBeUndefined()
  })

  it('still supports an explicitly provided global vue-i18n hook', () => {
    const globalHook = vi.fn(() => ({
      t: (key: string) => key === 'common.copy' ? 'Global Copy' : key,
    }))
    ;(globalThis as any).$vueI18nUse = globalHook

    const wrapper = mount(TestComponent)

    expect(wrapper.text()).toBe('Global Copy')
    expect(globalHook).toHaveBeenCalledTimes(1)
    expect((globalThis as any).$vueI18nUse).toBe(globalHook)
  })
})
