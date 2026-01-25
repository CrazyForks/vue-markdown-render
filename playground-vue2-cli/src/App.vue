<script>
/* global __MARKSTREAM_VUE2_CLI_DEMO_MD__ */

export default {
  name: 'App',
  data() {
    return {
      content: __MARKSTREAM_VUE2_CLI_DEMO_MD__,
    }
  },
}
</script>

<template>
  <div class="app">
    <h1>markstream-vue2 · Vue CLI (Webpack 4)</h1>
    <p class="hint">
      This playground uses CDN workers for KaTeX/Mermaid to avoid Webpack 4 worker import limitations.
    </p>

    <textarea v-model="content" class="editor" />

    <div class="preview markstream-vue2">
      <MarkdownRender
        :content="content"
        :final="true"
        :defer-nodes-until-visible="false"
        :batch-rendering="false"
        :viewport-priority="false"
        :themes="['vitesse-dark', 'vitesse-light']"
        :is-dark="false"
      />
    </div>
  </div>
</template>

<style scoped>
.app {
  max-width: 980px;
  margin: 0 auto;
  padding: 20px;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji",
    "Segoe UI Emoji";
}
.hint {
  margin: 8px 0 16px;
  color: #6b7280;
  font-size: 13px;
}
.editor {
  width: 100%;
  min-height: 180px;
  padding: 10px 12px;
  box-sizing: border-box;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 13px;
  line-height: 1.4;
}
.preview {
  margin-top: 16px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
</style>
