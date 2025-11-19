import MarkdownRender, { setCustomComponents, getUseMonaco } from 'vue-renderer-markdown'
import { defineComponent } from 'vue'

// Basic consumption test to ensure types are exported and usable.
setCustomComponents('playground-demo', { thinking: defineComponent({}) })

async function test() {
  const monaco = await getUseMonaco()
  // monaco may be `any` in types; this is just a smoke check
  return !!monaco
}

export default MarkdownRender
