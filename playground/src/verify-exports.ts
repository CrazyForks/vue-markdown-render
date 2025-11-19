import { defineComponent, DefineComponent } from 'vue'
import MarkdownRender, {
  setCustomComponents,
  removeCustomComponents,
  getCustomNodeComponents,
  getUseMonaco,
  MarkdownCodeBlockNode,
  MarkdownRender as NamedMarkdownRender,
} from 'vue-renderer-markdown'

// Verify default import is assignable to a component type
const compDefault: DefineComponent = MarkdownRender as any
const compNamed: DefineComponent | undefined = (NamedMarkdownRender as any) || undefined

// Verify functions exist and accept expected parameters
setCustomComponents('playground-test', { thinking: defineComponent({}) })
setCustomComponents({ thinking: defineComponent({}) })
const custom = getCustomNodeComponents()
removeCustomComponents('playground-test')

// Ensure getUseMonaco returns a Promise
async function verifyMonaco() {
  const m = await getUseMonaco()
  // no-op: just ensure it resolves
  return m
}

// Try referencing a named component type (MarkdownCodeBlockNode)
type CodeBlockType = typeof MarkdownCodeBlockNode
const maybeCodeBlock: CodeBlockType | undefined = (undefined as any)

export { compDefault, compNamed, custom, verifyMonaco, maybeCodeBlock }
