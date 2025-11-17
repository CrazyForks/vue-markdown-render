import typography from '@tailwindcss/typography'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector'],
  safelist: [
    'border-gray-400/5',
    'hover:bg-[var(--vscode-editor-selectionBackground)]',
  ],
  content: [
    './src/**/*.{vue,js,ts,jsx,tsx}',
    './node_modules/vue-renderer-markdown/dist/tailwind.ts',
    // 在 dev 环境为了不需要安装依赖，从 上层 dist 目录引入
    '../dist/tailwind.ts',
  ],
  theme: {
    extend: {
    },
  },
  plugins: [ typography ],
}
