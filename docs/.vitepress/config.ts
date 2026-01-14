import process from 'node:process'
import { defineConfig } from 'vitepress'

// TypeScript sometimes rejects VitePress site locales on the `Config` type.
// Cast to `any` to avoid strict type errors in the docs config while keeping intellisense.
export default defineConfig({
  title: 'markstream-vue',
  description: 'Streaming-friendly Markdown renderer for Vue 3 — progressive Mermaid, streaming diff code blocks',
  // Support deploying under a sub-path (for GitHub Pages like /username/repo/)
  base: process.env.VITEPRESS_BASE || '/',
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      title: 'markstream-vue',
      description: 'Streaming-friendly Markdown renderer for Vue 3',
      link: '/',
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'markstream-vue',
      description: '适用于 Vue 3 的流式 Markdown 渲染器',
      link: '/zh/',
    },
  },
  themeConfig: {
    logo: '/logo.svg',
    // Basic search is enabled by default. Use the 'local' provider for on-device search
    // or configure Algolia DocSearch by setting provider: 'algolia' and the options below.
    search: {
      provider: 'local',
    },

    nav: [
      { text: 'Get started', link: '/guide/quick-start' },
      { text: 'Examples', link: '/guide/examples' },
      { text: 'API', link: '/guide/components' },
      {
        text: 'Playground',
        items: [
          { text: 'Vue 3', link: 'https://markstream-vue.simonhe.me/' },
          { text: 'React', link: 'https://markstream-react.pages.dev/' },
          { text: 'Nuxt', link: 'https://markstream-nuxt.pages.dev/' },
          { text: 'Vue 2', link: 'https://markstream-vue2.pages.dev/' },
        ],
      },
      { text: 'GitHub', link: 'https://github.com/Simon-He95/markstream-vue' },

    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Frameworks',
          items: [
            {
              text: 'Vue 3 (markstream-vue) ⭐',
              items: [
                { text: 'Quick Start', link: '/guide/quick-start' },
                { text: 'Installation', link: '/guide/installation' },
                { text: 'Components API', link: '/guide/components' },
                { text: 'Usage & API', link: '/guide/usage' },
                { text: 'Features', link: '/guide/features' },
              ],
              collapsed: false,
            },
            {
              text: 'Vue 2 (markstream-vue2)',
              items: [
                { text: 'Quick Start', link: '/guide/vue2-quick-start' },
                { text: 'Installation', link: '/guide/vue2-installation' },
                { text: 'Components & API', link: '/guide/vue2-components' },
              ],
              collapsed: false,
            },
            {
              text: 'React (markstream-react)',
              items: [
                { text: 'Quick Start', link: '/guide/react-quick-start' },
                { text: 'Installation', link: '/guide/react-installation' },
                { text: 'Components & API', link: '/guide/react-components' },
              ],
              collapsed: false,
            },
            { text: 'Nuxt SSR', link: '/nuxt-ssr' },
          ],
        },
        {
          text: 'Vue 3 Guide',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Why use it?', link: '/guide/why' },
            { text: 'Compared', link: '/guide/compared' },
            { text: 'Props & Options', link: '/guide/props' },
            { text: 'Parser & API', link: '/guide/parser' },
            { text: 'Parser API (deep-dive)', link: '/guide/parser-api' },
            { text: 'Code block header', link: '/guide/codeblock-header' },
            { text: 'Examples', link: '/guide/examples' },
            { text: 'Playground', link: '/guide/playground' },
            { text: 'Docs assets', link: '/guide/docs-style' },
            { text: 'VitePress docs playbook', link: '/guide/vitepress-docs' },
            { text: 'Contributing', link: '/guide/contributing' },
            { text: 'Translation guide', link: '/guide/translation' },
            { text: 'Deploy docs', link: '/guide/deploy' },
            { text: 'Advanced', link: '/guide/advanced' },
            { text: 'Monaco Internals', link: '/guide/monaco-internals' },
            { text: 'Math', link: '/guide/math' },
            { text: 'Mermaid', link: '/guide/mermaid' },
            { text: 'MermaidBlockNode', link: '/guide/mermaid-block-node' },
            { text: 'MermaidBlockNode (override)', link: '/guide/mermaid-block-node-override' },
            { text: 'Mermaid export demo', link: '/guide/mermaid-export-demo' },
            { text: 'AntV Infographic', link: '/guide/infographic' },
            { text: 'ECharts', link: '/guide/echarts' },
            { text: 'Tailwind', link: '/guide/tailwind' },
            { text: 'Legacy builds & iOS regex compatibility', link: '/guide/legacy-builds' },
            { text: 'Thanks', link: '/guide/thanks' },
          ],
        },
        {
          text: 'Quick links',
          items: [
            { text: 'Examples', link: '/guide/examples' },
            { text: 'API Reference', link: '/guide/components' },
            {
              text: 'Playground',
              items: [
                { text: 'Vue 3', link: 'https://markstream-vue.simonhe.me/' },
                { text: 'React', link: 'https://markstream-react.pages.dev/' },
                { text: 'Nuxt', link: 'https://markstream-nuxt.pages.dev/' },
                { text: 'Vue 2', link: 'https://markstream-vue2.pages.dev/' },
              ],
            },
            { text: 'Performance', link: '/guide/performance' },
            { text: 'Monaco', link: '/guide/monaco' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          ],
        },
        {
          text: 'Investigations',
          items: [
            { text: 'e2e testing report', link: '/e2e-testing-report' },
            { text: 'KaTeX worker performance', link: '/katex-worker-performance-analysis' },
            { text: 'Monorepo migration', link: '/monorepo-migration' },
          ],
        },
      ],
      '/zh/guide/': [
        {
          text: '框架',
          items: [
            {
              text: 'Vue 3 (markstream-vue) ⭐',
              items: [
                { text: '快速开始', link: '/zh/guide/quick-start' },
                { text: '安装', link: '/zh/guide/installation' },
                { text: '组件 API', link: '/zh/guide/components' },
                { text: '使用与 API', link: '/zh/guide/usage' },
                { text: '功能', link: '/zh/guide/features' },
              ],
              collapsed: false,
            },
            {
              text: 'Vue 2 (markstream-vue2)',
              items: [
                { text: '快速开始', link: '/zh/guide/vue2-quick-start' },
                { text: '安装', link: '/zh/guide/vue2-installation' },
                { text: '组件与 API', link: '/zh/guide/vue2-components' },
              ],
              collapsed: false,
            },
            {
              text: 'React (markstream-react)',
              items: [
                { text: '快速开始', link: '/zh/guide/react-quick-start' },
                { text: '安装', link: '/zh/guide/react-installation' },
                { text: '组件与 API', link: '/zh/guide/react-components' },
              ],
              collapsed: false,
            },
            { text: 'Nuxt SSR', link: '/nuxt-ssr' },
          ],
        },
        {
          text: 'Vue 3 指南',
          items: [
            { text: '简介', link: '/zh/guide/' },
            { text: '为什么使用？', link: '/zh/guide/why' },
            { text: '对比', link: '/zh/guide/compared' },
            { text: 'Props 与 Options', link: '/zh/guide/props' },
            { text: '解析器概览', link: '/zh/guide/parser' },
            { text: '解析器 API 深入', link: '/zh/guide/parser-api' },
            { text: '代码块头部', link: '/zh/guide/codeblock-header' },
            { text: '示例', link: '/zh/guide/examples' },
            { text: 'Playground', link: '/zh/guide/playground' },
            { text: 'Docs 资源', link: '/zh/guide/docs-style' },
            { text: 'VitePress 文档指南', link: '/zh/guide/vitepress-docs' },
            { text: '贡献指南', link: '/zh/guide/contributing' },
            { text: '翻译指南', link: '/zh/guide/translation' },
            { text: '部署文档', link: '/zh/guide/deploy' },
            { text: '高级', link: '/zh/guide/advanced' },
            { text: 'Monaco 内部', link: '/zh/guide/monaco-internals' },
            { text: 'Math', link: '/zh/guide/math' },
            { text: 'Mermaid', link: '/zh/guide/mermaid' },
            { text: 'MermaidBlockNode', link: '/zh/guide/mermaid-block-node' },
            { text: '覆盖 MermaidBlockNode（示例）', link: '/zh/guide/mermaid-block-node-override' },
            { text: 'Mermaid 导出示例', link: '/zh/guide/mermaid-export-demo' },
            { text: 'AntV Infographic', link: '/zh/guide/infographic' },
            { text: 'ECharts', link: '/zh/guide/echarts' },
            { text: 'Tailwind', link: '/zh/guide/tailwind' },
            { text: 'Legacy 构建与 iOS 正则兼容', link: '/zh/guide/legacy-builds' },
            { text: '致谢', link: '/zh/guide/thanks' },
          ],
        },
        {
          text: '快速链接',
          items: [
            { text: '示例', link: '/zh/guide/examples' },
            { text: 'API 参考', link: '/zh/guide/components' },
            {
              text: '演示',
              items: [
                { text: 'Vue 3', link: 'https://markstream-vue.simonhe.me/' },
                { text: 'React', link: 'https://markstream-react.pages.dev/' },
                { text: 'Nuxt', link: 'https://markstream-nuxt.pages.dev/' },
                { text: 'Vue 2', link: 'https://markstream-vue2.pages.dev/' },
              ],
            },
            { text: '性能', link: '/guide/performance' },
            { text: 'Monaco', link: '/guide/monaco' },
            { text: '故障排除', link: '/guide/troubleshooting' },
          ],
        },
        {
          text: '研究与调查',
          items: [
            { text: 'e2e 测试与分析', link: '/zh/guide/e2e-testing-report' },
            { text: 'KaTeX Worker 性能', link: '/zh/guide/katex-worker-performance-analysis' },
            { text: 'Monorepo 迁移', link: '/zh/guide/monorepo-migration' },
          ],
        },
      ],
      '/': [
        {
          text: 'Frameworks',
          items: [
            {
              text: 'Vue 3 (markstream-vue) ⭐',
              items: [
                { text: 'Quick Start', link: '/guide/quick-start' },
                { text: 'Installation', link: '/guide/installation' },
                { text: 'Components API', link: '/guide/components' },
                { text: 'Usage & API', link: '/guide/usage' },
                { text: 'Features', link: '/guide/features' },
              ],
              collapsed: false,
            },
            {
              text: 'Vue 2 (markstream-vue2)',
              items: [
                { text: 'Quick Start', link: '/guide/vue2-quick-start' },
                { text: 'Installation', link: '/guide/vue2-installation' },
                { text: 'Components & API', link: '/guide/vue2-components' },
              ],
              collapsed: false,
            },
            {
              text: 'React (markstream-react)',
              items: [
                { text: 'Quick Start', link: '/guide/react-quick-start' },
                { text: 'Installation', link: '/guide/react-installation' },
                { text: 'Components & API', link: '/guide/react-components' },
              ],
              collapsed: false,
            },
            { text: 'Nuxt SSR', link: '/nuxt-ssr' },
          ],
        },
        {
          text: 'Vue 3 Guide',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Why use it?', link: '/guide/why' },
            { text: 'Compared', link: '/guide/compared' },
            { text: 'Props & Options', link: '/guide/props' },
            { text: 'Parser & API', link: '/guide/parser' },
            { text: 'Parser API (deep-dive)', link: '/guide/parser-api' },
            { text: 'Code block header', link: '/guide/codeblock-header' },
            { text: 'Examples', link: '/guide/examples' },
            { text: 'Playground', link: '/guide/playground' },
            { text: 'Docs assets', link: '/guide/docs-style' },
            { text: 'VitePress docs playbook', link: '/guide/vitepress-docs' },
            { text: 'Contributing', link: '/guide/contributing' },
            { text: 'Translation guide', link: '/guide/translation' },
            { text: 'Deploy docs', link: '/guide/deploy' },
            { text: 'Advanced', link: '/guide/advanced' },
            { text: 'Monaco Internals', link: '/guide/monaco-internals' },
            { text: 'Math', link: '/guide/math' },
            { text: 'Mermaid', link: '/guide/mermaid' },
            { text: 'MermaidBlockNode', link: '/guide/mermaid-block-node' },
            { text: 'MermaidBlockNode (override)', link: '/guide/mermaid-block-node-override' },
            { text: 'AntV Infographic', link: '/guide/infographic' },
            { text: 'ECharts', link: '/guide/echarts' },
            { text: 'Tailwind', link: '/guide/tailwind' },
            { text: 'Legacy builds & iOS regex compatibility', link: '/guide/legacy-builds' },
            { text: 'Thanks', link: '/guide/thanks' },
          ],
        },
        {
          text: 'Quick links',
          items: [
            { text: 'Examples', link: '/guide/examples' },
            { text: 'API Reference', link: '/guide/components' },
            {
              text: 'Playground',
              items: [
                { text: 'Vue 3', link: 'https://markstream-vue.simonhe.me/' },
                { text: 'React', link: 'https://markstream-react.pages.dev/' },
                { text: 'Nuxt', link: 'https://markstream-nuxt.pages.dev/' },
                { text: 'Vue 2', link: 'https://markstream-vue2.pages.dev/' },
              ],
            },
            { text: 'Performance', link: '/guide/performance' },
            { text: 'Monaco', link: '/guide/monaco' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          ],
        },
        {
          text: 'Investigations',
          items: [
            { text: 'e2e testing report', link: '/e2e-testing-report' },
            { text: 'KaTeX worker performance', link: '/katex-worker-performance-analysis' },
            { text: 'Monorepo migration', link: '/monorepo-migration' },
          ],
        },
      ],
    },
    locales: {
      root: {
        selectText: 'Languages',
        label: 'English',
        ariaLabel: 'Select language',
        nav: [
          { text: 'Get started', link: '/guide/quick-start' },
          { text: 'Examples', link: '/guide/examples' },
          { text: 'API', link: '/guide/components' },
          { text: 'Playground', link: 'https://markstream-vue.simonhe.me/' },
          { text: 'GitHub', link: 'https://github.com/Simon-He95/markstream-vue' },
        ],
      },
      zh: {
        selectText: '选择语言',
        label: '简体中文',
        ariaLabel: '选择语言',
        nav: [
          { text: '快速开始', link: '/zh/guide/quick-start' },
          { text: '示例', link: '/zh/guide/examples' },
          { text: 'API', link: '/zh/guide/components' },
          {
            text: '演示',
            items: [
              { text: 'Vue 3', link: 'https://markstream-vue.simonhe.me/' },
              { text: 'React', link: 'https://markstream-react.pages.dev/' },
              { text: 'Nuxt', link: 'https://markstream-nuxt.pages.dev/' },
              { text: 'Vue 2', link: 'https://markstream-vue2.pages.dev/' },
            ],
          },
          { text: '搜索', link: '/zh/guide/search' },
          { text: 'GitHub', link: 'https://github.com/Simon-He95/markstream-vue' },
        ],
      },
    },
  },
  // Optional: use Algolia DocSearch instead of local search. To enable,
  // set `themeConfig.search.provider = 'algolia'` and add `themeConfig.search.options`.
  // Example:
  // themeConfig: {
  //   ...
  //   search: {
  //     provider: 'algolia',
  //     options: {
  //       appId: 'YOUR_APP_ID',
  //       apiKey: 'YOUR_SEARCH_ONLY_API_KEY',
  //       indexName: 'YOUR_INDEX_NAME'
  //     }
  //   }
  // }
} as any)
