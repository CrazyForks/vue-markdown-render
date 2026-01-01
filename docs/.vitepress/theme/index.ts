import type { EnhanceAppContext } from 'vitepress'
import Theme from 'vitepress/theme'
import GitHubStarBadge from './GitHubStarBadge.vue'
import Layout from './Layout.vue'
import './style.css'

export default {
  extends: Theme,
  Layout,
  enhanceApp({ app }: EnhanceAppContext) {
    app.component('GitHubStarBadge', GitHubStarBadge)
  },
}
