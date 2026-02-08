import type { VueConstructor } from 'vue'
import D2BlockNode from './D2BlockNode.vue'

D2BlockNode.install = (app: VueConstructor) => {
  app.component(D2BlockNode.__name as string, D2BlockNode)
}

export default D2BlockNode
