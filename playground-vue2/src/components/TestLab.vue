<script>
import MarkdownRender from 'markstream-vue2'
import { decodeMarkdownHash, resolveFrameworkTestHref } from '../../../playground-shared/testPageState'

const CURRENT_FRAMEWORK = 'vue2'

const frameworkCards = Object.freeze([
  {
    id: 'vue3',
    label: 'Vue 3',
    note: '主 playground',
    origin: 'https://markstream-vue.simonhe.me',
    localPort: null,
  },
  {
    id: 'vue2',
    label: 'Vue 2',
    note: '当前 test page',
    origin: 'https://markstream-vue2.pages.dev',
    localPort: 3334,
  },
  {
    id: 'react',
    label: 'React',
    note: '跨框架对照',
    origin: 'https://markstream-react.pages.dev',
    localPort: 4174,
  },
])

const sampleCards = Object.freeze([
  {
    id: 'baseline',
    title: '基础回归',
    summary: '标题、数学、Mermaid 和代码块一起测。',
    content: `# Vue 2 Test Page

用同一份 markdown 和 Vue 3 / React 做对照，快速查兼容问题。

## 基础格式

- **Bold**
- *Italic*
- \`inline code\`

## 数学

行内：$a^2 + b^2 = c^2$

## Mermaid

\`\`\`mermaid
flowchart LR
  Input --> Parse --> Render
\`\`\`

## Code

\`\`\`js
export function helloVue2() {
  return 'markstream-vue2 /test ready'
}
\`\`\`
`,
  },
  {
    id: 'diff',
    title: 'Diff',
    summary: '更适合观察代码块流和折叠变化。',
    content: `# Diff Regression

\`\`\`diff
--- before.ts
+++ after.ts
@@ -1,4 +1,8 @@
-export const value = 1
+export const value = 2
+export const status = 'updated'
\`\`\`

\`\`\`ts
export const framework = 'vue2'
export const route = '/test'
\`\`\`
`,
  },
  {
    id: 'stress',
    title: '结构压力',
    summary: '列表、表格和引用一起看。',
    content: `# Structural Stress

> 观察 streaming 中间态是否稳定。

## 列表

1. 第一层
   - 第二层
     - 第三层

## 表格

| Item | Check |
| --- | --- |
| Vue 2 | /test |
| Vue 3 | /test |
| React | /test |
`,
  },
])

export default {
  name: 'Vue2TestLab',
  components: {
    MarkdownRender,
  },
  data() {
    return {
      selectedSampleId: 'baseline',
      input: sampleCards[0].content,
      streamContent: '',
      isStreaming: false,
      streamSpeed: 4,
      streamInterval: 24,
      timer: null,
      frameworkCards,
      sampleCards,
      currentFramework: CURRENT_FRAMEWORK,
    }
  },
  computed: {
    previewContent() {
      return this.isStreaming ? this.streamContent : this.input
    },
    activeSample() {
      return this.sampleCards.find(sample => sample.id === this.selectedSampleId) || this.sampleCards[0]
    },
    progress() {
      if (!this.input.length)
        return 0
      return Math.min(100, Math.round((this.previewContent.length / this.input.length) * 100))
    },
    charCount() {
      return this.input.length
    },
    lineCount() {
      return this.input ? this.input.split('\n').length : 0
    },
  },
  beforeUnmount() {
    this.stopStreamRender()
  },
  mounted() {
    const restored = decodeMarkdownHash(window.location.hash || '')
    if (restored)
      this.input = restored
  },
  methods: {
    clampInt(value, min, max, fallback) {
      const normalized = Number.isFinite(value) ? Math.round(value) : fallback
      return Math.min(max, Math.max(min, normalized))
    },
    applySample(id) {
      const sample = this.sampleCards.find(item => item.id === id)
      if (!sample)
        return
      this.stopStreamRender()
      this.selectedSampleId = sample.id
      this.input = sample.content
    },
    scheduleNextChunk() {
      if (!this.isStreaming)
        return
      const nextLength = Math.min(this.streamContent.length + this.streamSpeed, this.input.length)
      this.streamContent = this.input.slice(0, nextLength)
      if (nextLength >= this.input.length) {
        this.stopStreamRender()
        return
      }
      this.timer = window.setTimeout(() => this.scheduleNextChunk(), this.streamInterval)
    },
    startStreamRender() {
      if (this.isStreaming) {
        this.stopStreamRender()
        return
      }
      this.streamSpeed = this.clampInt(this.streamSpeed, 1, 80, 4)
      this.streamInterval = this.clampInt(this.streamInterval, 8, 300, 24)
      this.streamContent = ''
      this.isStreaming = true
      this.scheduleNextChunk()
    },
    stopStreamRender() {
      if (this.timer != null) {
        window.clearTimeout(this.timer)
        this.timer = null
      }
      this.isStreaming = false
    },
    resetEditor() {
      this.applySample(this.selectedSampleId)
    },
    clearEditor() {
      this.stopStreamRender()
      this.input = ''
    },
    goHome() {
      this.stopStreamRender()
      this.$emit('navigate-home')
    },
    frameworkHref(id) {
      const framework = this.frameworkCards.find(item => item.id === id)
      if (!framework)
        return '/test'
      return resolveFrameworkTestHref(
        framework,
        this.currentFramework,
        this.input,
        typeof window !== 'undefined'
          ? { hostname: window.location.hostname, protocol: window.location.protocol }
          : undefined,
      )
    },
  },
}
</script>

<template>
  <div class="test-lab">
    <div class="test-lab__shell">
      <section class="hero-panel">
        <div class="hero-copy">
          <span class="eyebrow">Vue 2 Compatibility Lab</span>
          <h1>markstream-vue2 /test</h1>
          <p>
            专门用来和 Vue 3、React 的 test page 做横向对照，检查兼容层是否出现偏差。
          </p>
        </div>

        <div class="hero-metrics">
          <div class="metric-card">
            <span>字符数</span>
            <strong>{{ charCount }}</strong>
          </div>
          <div class="metric-card">
            <span>行数</span>
            <strong>{{ lineCount }}</strong>
          </div>
          <div class="metric-card">
            <span>预览进度</span>
            <strong>{{ progress }}%</strong>
          </div>
        </div>

        <div class="framework-switcher">
          <a
            v-for="framework in frameworkCards"
            :key="framework.id"
            class="framework-chip"
            :class="{ 'framework-chip--current': framework.id === currentFramework }"
            :href="frameworkHref(framework.id)"
          >
            <span class="framework-chip__label">{{ framework.label }}</span>
            <span class="framework-chip__note">{{ framework.note }}</span>
          </a>
        </div>
      </section>

      <div class="lab-layout">
        <aside class="panel-card sidebar-card">
          <div class="panel-head">
            <div>
              <h2>样例切换</h2>
              <p>选一段输入，直接开始回归。</p>
            </div>
            <span class="mini-pill">{{ activeSample.title }}</span>
          </div>

          <div class="sample-list">
            <button
              v-for="sample in sampleCards"
              :key="sample.id"
              type="button"
              class="sample-card"
              :class="{ 'sample-card--active': sample.id === selectedSampleId }"
              @click="applySample(sample.id)"
            >
              <strong>{{ sample.title }}</strong>
              <span>{{ sample.summary }}</span>
            </button>
          </div>

          <div class="panel-head panel-head--spaced">
            <div>
              <h2>流式控制</h2>
              <p>看 Vue 2 版本在 streaming 下是否稳定。</p>
            </div>
          </div>

          <div class="control-grid">
            <label class="input-card">
              <span>每次追加字符</span>
              <input v-model.number="streamSpeed" type="number" min="1" max="80">
            </label>
            <label class="input-card">
              <span>更新时间间隔 (ms)</span>
              <input v-model.number="streamInterval" type="number" min="8" max="300">
            </label>
          </div>

          <div class="button-grid">
            <button type="button" class="btn btn--primary" @click="startStreamRender">
              {{ isStreaming ? '停止流式渲染' : '开始流式渲染' }}
            </button>
            <button type="button" class="btn" @click="resetEditor">
              重置样例
            </button>
            <button type="button" class="btn" @click="clearEditor">
              清空输入
            </button>
            <button type="button" class="btn" @click="goHome">
              返回主 demo
            </button>
          </div>
        </aside>

        <section class="workspace-grid">
          <article class="workspace-card">
            <header class="workspace-card__head">
              <div>
                <h2>Markdown 输入</h2>
                <p>把复现内容直接贴进来。</p>
              </div>
            </header>

            <textarea
              v-model="input"
              class="editor-textarea"
              spellcheck="false"
              placeholder="在这里粘贴 markdown..."
            />

            <footer class="workspace-card__foot">
              <span>{{ charCount }} chars</span>
              <span>{{ lineCount }} lines</span>
            </footer>
          </article>

          <article class="workspace-card">
            <header class="workspace-card__head">
              <div>
                <h2>实时预览</h2>
                <p>{{ isStreaming ? 'Streaming 中' : '已显示完整输入' }}</p>
              </div>
              <span class="mini-pill">{{ progress }}%</span>
            </header>

            <div class="preview-surface">
              <MarkdownRender
                :content="previewContent"
                :final="!isStreaming"
                :typewriter="false"
                :code-block-stream="true"
              />
            </div>

            <footer class="workspace-card__foot">
              <span>{{ previewContent.length }} / {{ input.length || 0 }}</span>
              <span>Vue 2 renderer</span>
            </footer>
          </article>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.test-lab {
  min-height: 100vh;
  padding: 24px 16px 36px;
  background:
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.12), transparent 30%),
    radial-gradient(circle at 85% 15%, rgba(59, 130, 246, 0.12), transparent 26%),
    linear-gradient(180deg, #f8fbff 0%, #f2f6fb 100%);
  color: #10203a;
}

.test-lab__shell {
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  gap: 18px;
}

.hero-panel,
.panel-card,
.workspace-card {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.12);
}

.hero-panel {
  padding: 24px;
  display: grid;
  gap: 18px;
}

.eyebrow {
  display: inline-flex;
  width: fit-content;
  padding: 7px 11px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-copy h1 {
  margin: 12px 0 10px;
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 0.96;
}

.hero-copy p,
.panel-head p,
.workspace-card__head p,
.workspace-card__foot,
.sample-card span {
  margin: 0;
  color: #5b6f88;
  line-height: 1.6;
}

.hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.metric-card,
.sample-card,
.input-card,
.framework-chip {
  border-radius: 18px;
  border: 1px solid rgba(15, 23, 42, 0.07);
  background: rgba(255, 255, 255, 0.82);
}

.metric-card {
  padding: 14px 16px;
}

.metric-card span {
  display: block;
  color: #5b6f88;
  font-size: 0.82rem;
  margin-bottom: 8px;
}

.metric-card strong {
  font-size: 1.3rem;
}

.framework-switcher {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.framework-chip {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  color: inherit;
  text-decoration: none;
}

.framework-chip--current {
  border-color: rgba(37, 99, 235, 0.24);
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(255, 255, 255, 0.94));
}

.framework-chip__label {
  font-weight: 700;
}

.framework-chip__note {
  color: #5b6f88;
  font-size: 0.88rem;
}

.lab-layout {
  display: grid;
  grid-template-columns: 330px minmax(0, 1fr);
  gap: 18px;
}

.panel-card {
  padding: 18px;
}

.panel-head,
.workspace-card__head,
.workspace-card__foot {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.panel-head--spaced {
  margin-top: 18px;
}

.panel-head h2,
.workspace-card__head h2 {
  margin: 0;
  font-size: 1.05rem;
}

.mini-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 7px 11px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.05);
  color: #5b6f88;
  font-size: 0.78rem;
  font-weight: 700;
}

.sample-list,
.button-grid,
.workspace-grid {
  display: grid;
  gap: 12px;
}

.sample-list {
  margin-top: 14px;
}

.sample-card {
  width: 100%;
  padding: 13px 15px;
  text-align: left;
  cursor: pointer;
}

.sample-card strong {
  display: block;
  margin-bottom: 6px;
}

.sample-card--active {
  border-color: rgba(37, 99, 235, 0.24);
  background: rgba(37, 99, 235, 0.08);
}

.control-grid {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.input-card {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
}

.input-card span {
  color: #5b6f88;
  font-size: 0.86rem;
}

.input-card input {
  border: 0;
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(15, 23, 42, 0.05);
  color: #10203a;
  font: inherit;
}

.button-grid {
  margin-top: 14px;
}

.btn {
  border: 0;
  border-radius: 16px;
  padding: 12px 14px;
  background: rgba(15, 23, 42, 0.06);
  color: #10203a;
  font: inherit;
  cursor: pointer;
}

.btn--primary {
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  color: #fff;
}

.workspace-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.workspace-card {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 720px;
}

.workspace-card__head,
.workspace-card__foot {
  padding: 18px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
}

.workspace-card__foot {
  border-top: 1px solid rgba(15, 23, 42, 0.06);
  border-bottom: 0;
}

.editor-textarea {
  width: 100%;
  min-height: 520px;
  border: 0;
  resize: none;
  padding: 20px 18px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.92), rgba(255, 255, 255, 0.98));
  color: #0f172a;
  font:
    500 0.94rem/1.7 "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
}

.editor-textarea:focus {
  outline: none;
}

.preview-surface {
  min-height: 520px;
  padding: 20px 18px;
  overflow: auto;
}

@media (max-width: 1120px) {
  .lab-layout,
  .workspace-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .hero-metrics,
  .framework-switcher {
    grid-template-columns: 1fr;
  }

  .workspace-card {
    min-height: 620px;
  }

  .editor-textarea,
  .preview-surface {
    min-height: 400px;
  }
}
</style>
