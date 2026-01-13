import type { EnhanceAppContext } from 'vitepress'
import MarkdownRender from 'markstream-vue'
import Theme from 'vitepress/theme'
import GitHubStarBadge from './GitHubStarBadge.vue'
import Layout from './Layout.vue'
import 'markstream-vue/index.css'
import './style.css'

export default {
  extends: Theme,
  Layout,
  enhanceApp({ app }: EnhanceAppContext) {
    app.component('GitHubStarBadge', GitHubStarBadge)
    app.component('MarkdownRender', MarkdownRender)
  },
}

// Export useDark for use in VitePress markdown files and components
export { useDark } from './composables/useDark'
