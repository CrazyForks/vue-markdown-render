<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'
import { decodeMarkdownHash, encodeMarkdownPayload, resolveFrameworkTestHref, withMarkdownHash } from '../../../playground-shared/testPageState'
import CodeBlockNode from '../../../src/components/CodeBlockNode'
import { getUseMonaco } from '../../../src/components/CodeBlockNode/monaco'
import MarkdownCodeBlockNode from '../../../src/components/MarkdownCodeBlockNode'
import { disableKatex, enableKatex, isKatexEnabled } from '../../../src/components/MathInlineNode/katex'
import { disableMermaid, enableMermaid, isMermaidEnabled } from '../../../src/components/MermaidBlockNode/mermaid'
import MarkdownRender from '../../../src/components/NodeRenderer'
import PreCodeNode from '../../../src/components/PreCodeNode'
import { setCustomComponents } from '../../../src/utils/nodeComponents'
import KatexWorker from '../../../src/workers/katexRenderer.worker?worker&inline'
import { setKaTeXWorker } from '../../../src/workers/katexWorkerClient'
import MermaidWorker from '../../../src/workers/mermaidParser.worker?worker&inline'
import { setMermaidWorker } from '../../../src/workers/mermaidWorkerClient'
import 'katex/dist/katex.min.css'

type SampleId = 'baseline' | 'diff' | 'stress'
type FrameworkId = 'vue3' | 'vue2' | 'react'

const CURRENT_FRAMEWORK: FrameworkId = 'vue3'

const frameworkCards = [
  {
    id: 'vue3',
    label: 'Vue 3',
    note: '当前 playground',
    origin: 'https://markstream-vue.simonhe.me',
    localPort: null,
  },
  {
    id: 'vue2',
    label: 'Vue 2',
    note: '兼容层与老项目回归',
    origin: 'https://markstream-vue2.pages.dev',
    localPort: 3334,
  },
  {
    id: 'react',
    label: 'React',
    note: 'hooks / workers / 渲染对照',
    origin: 'https://markstream-react.pages.dev',
    localPort: 4174,
  },
] as const satisfies ReadonlyArray<{
  id: FrameworkId
  label: string
  note: string
  origin: string
  localPort: number | null
}>

const sampleCards = [
  {
    id: 'baseline',
    title: '基础回归',
    summary: '标题、强调、数学、Mermaid 和 infographic 一次看全。',
    content: `# Markstream Test Lab

在这里可以快速验证 **Vue 3 / Vue 2 / React** 三套渲染器的表现是否一致。

## 基础格式

- **加粗**
- *斜体*
- \`inline code\`
- [链接](https://github.com/Simon-He95/markstream-vue)

## 数学

行内公式：$E = mc^2$

块级公式：

$$
\\int_0^1 x^2 dx = \\frac{1}{3}
$$

## Mermaid

\`\`\`mermaid
flowchart LR
  Prompt --> Parser --> Renderer --> Preview
\`\`\`

## 代码块

\`\`\`ts
export function compareFramework(name: string) {
  return \`\${name} test page is ready.\`
}
\`\`\`

## Infographic

\`\`\`infographic
infographic list-row-simple-horizontal-arrow
data
  items
    - label 输入
      desc markdown
    - label 渲染
      desc 解析与增量更新
    - label 对照
      desc 跨框架检查
\`\`\`
`,
  },
  {
    id: 'diff',
    title: 'Diff 与代码流',
    summary: '观察 diff code block、长文本和流式更新的稳定性。',
    content: `# Diff Regression

下面这个样例更适合观察 **code block stream** 和折叠逻辑：

\`\`\`diff
diff --git a/src/render.ts b/src/render.ts
index 0000000..1111111 100644
--- a/src/render.ts
+++ b/src/render.ts
@@ -1,7 +1,12 @@
-export function render(input) {
-  return input
+export function render(input: string) {
+  if (!input.trim())
+    return 'empty'
+
+  const normalized = input.replace(/\\r\\n/g, '\\n')
+  return normalized
 }
\`\`\`

再加一段普通代码，方便对比 Monaco / MarkdownCodeBlock / PreCodeNode：

\`\`\`tsx
export function TestHarness() {
  return (
    <section>
      <h2>Regression</h2>
      <p>Streaming should remain smooth.</p>
    </section>
  )
}
\`\`\`
`,
  },
  {
    id: 'stress',
    title: '结构压力',
    summary: '列表、表格、引用、HTML 和长段落一起压一遍。',
    content: `# Structural Stress

> 这个样例用于检查复杂结构在 streaming 中是否抖动、错位或丢节点。

## 列表

1. 第一层
   - 第二层
     - 第三层
2. 继续

## 表格

| Framework | Route | Purpose |
| --- | --- | --- |
| Vue 3 | \`/test\` | 主调试台 |
| Vue 2 | \`/test\` | 兼容回归 |
| React | \`/test\` | 跨框架对照 |

## HTML

<details>
  <summary>展开看一段 HTML</summary>
  <p>如果这里的结构错了，通常说明 HTML block / inline 的边界处理有问题。</p>
</details>

## 长段落

Markstream 现在不仅要处理单次完整渲染，还要处理 AI 场景下不断追加的 markdown 内容，所以这个页面更像一个回归驾驶舱。你可以一边编辑左侧输入，一边切换 Vue 2 或 React 的 test page，用同一段内容观察差异，判断问题是解析层、组件层，还是框架适配层。
`,
  },
] as const satisfies ReadonlyArray<{
  id: SampleId
  title: string
  summary: string
  content: string
}>

const diffHideUnchangedRegions = {
  enabled: true,
  contextLineCount: 2,
  minimumLineCount: 4,
  revealLineCount: 2,
} as const

const testPageMonacoOptions = {
  renderSideBySide: true,
  useInlineViewWhenSpaceIsLimited: true,
  maxComputationTime: 0,
  ignoreTrimWhitespace: false,
  renderIndicators: true,
  diffAlgorithm: 'legacy',
  diffHideUnchangedRegions,
  hideUnchangedRegions: diffHideUnchangedRegions,
} as const

const selectedSampleId = useLocalStorage<SampleId>('vmr-test-sample', 'baseline')
const input = ref<string>(sampleCards[0].content)
const streamContent = ref<string>('')
const isStreaming = ref(false)
const streamSpeed = useLocalStorage<number>('vmr-test-stream-speed', 4)
const streamInterval = useLocalStorage<number>('vmr-test-stream-interval', 24)
const showStreamSettings = useLocalStorage<boolean>('vmr-test-show-settings', true)

const renderMode = useLocalStorage<'monaco' | 'pre' | 'markdown'>('vmr-test-render-mode', 'monaco')
const codeBlockStream = useLocalStorage<boolean>('vmr-test-code-stream', true)
const viewportPriority = useLocalStorage<boolean>('vmr-test-viewport-priority', true)
const batchRendering = useLocalStorage<boolean>('vmr-test-batch-rendering', true)
const typewriter = useLocalStorage<boolean>('vmr-test-typewriter', true)
const debugParse = useLocalStorage<boolean>('vmr-test-debug-parse', false)
const mathEnabled = useLocalStorage<boolean>('vmr-test-math-enabled', isKatexEnabled())
const mermaidEnabled = useLocalStorage<boolean>('vmr-test-mermaid-enabled', isMermaidEnabled())

getUseMonaco()
setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())

const shareUrl = ref<string>('')
const tooLong = ref(false)
const notice = ref<string>('')
const noticeType = ref<'success' | 'error' | 'info'>('success')
const isWorking = ref(false)
const isCopied = ref(false)
const issueUrl = ref<string>('')
const MAX_URL_LEN = 2000

const activeSample = computed(() => sampleCards.find(sample => sample.id === selectedSampleId.value) ?? sampleCards[0])
const previewContent = computed(() => (isStreaming.value ? streamContent.value : input.value))
const streamProgress = computed(() => {
  if (!input.value.length)
    return 0
  return Math.min(100, Math.round((previewContent.value.length / input.value.length) * 100))
})
const renderModeLabel = computed(() => {
  if (renderMode.value === 'markdown')
    return 'MarkdownCodeBlock'
  if (renderMode.value === 'pre')
    return 'PreCodeNode'
  return 'Monaco'
})
const charCount = computed(() => input.value.length)
const lineCount = computed(() => (input.value ? input.value.split('\n').length : 0))

function clampInt(value: number, min: number, max: number, fallback: number) {
  const normalized = Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(max, Math.max(min, normalized))
}

function basePageUrl() {
  const url = new URL(window.location.href)
  url.hash = ''
  return url.toString()
}

function buildIssueUrl(text: string) {
  const base = 'https://github.com/Simon-He95/markstream-vue/issues/new?template=bug_report.yml'
  const body = `**Reproduction input**:\n\nPlease find the reproduction input below:\n\n\`\`\`markdown\n${text}\n\`\`\``
  return `${base}&body=${encodeURIComponent(body)}`
}

function generateShareLink() {
  const payload = encodeMarkdownPayload(input.value)
  if (!payload)
    return
  const full = withMarkdownHash(basePageUrl(), input.value)

  if (full.length > MAX_URL_LEN) {
    tooLong.value = true
    shareUrl.value = ''
    issueUrl.value = buildIssueUrl(input.value)
    showToast('内容太长，建议直接附到 GitHub Issue。', 'info', 4000)
    return
  }

  tooLong.value = false
  shareUrl.value = full
  window.history.replaceState(undefined, '', full)
}

async function copyShareLink() {
  const target = shareUrl.value || basePageUrl()
  try {
    await navigator.clipboard.writeText(target)
    return true
  }
  catch (error) {
    console.warn('copy failed', error)
    return false
  }
}

function showToast(message: string, type: 'success' | 'error' | 'info' = 'success', duration = 2200) {
  notice.value = message
  noticeType.value = type
  if (duration > 0)
    window.setTimeout(() => (notice.value = ''), duration)
}

async function generateAndCopy() {
  isWorking.value = true
  isCopied.value = false
  generateShareLink()

  if (tooLong.value) {
    isWorking.value = false
    return
  }

  const copied = await copyShareLink()
  isWorking.value = false

  if (copied) {
    isCopied.value = true
    showToast('分享链接已复制。', 'success', 1800)
    window.setTimeout(() => (isCopied.value = false), 1800)
  }
  else {
    showToast('复制失败，请手动复制地址栏链接。', 'error', 3000)
  }
}

async function copyRawInput() {
  const target = buildIssueUrl(input.value)
  issueUrl.value = target

  try {
    await navigator.clipboard.writeText(target)
    showToast('Issue 链接已复制。', 'success', 2200)
  }
  catch (error) {
    console.warn('copy failed', error)
    showToast('复制失败，请手动打开 Issue。', 'error', 3000)
  }
}

function openIssueInNewTab() {
  if (!issueUrl.value)
    issueUrl.value = buildIssueUrl(input.value)

  try {
    window.open(issueUrl.value, '_blank')
  }
  catch {
    window.location.href = issueUrl.value
  }
}

function restoreFromUrl() {
  const decoded = decodeMarkdownHash(window.location.hash || '')
  if (!decoded)
    return false

  input.value = decoded
  return true
}

function applySample(sampleId: SampleId) {
  const sample = sampleCards.find(item => item.id === sampleId)
  if (!sample)
    return

  stopStreamRender()
  selectedSampleId.value = sample.id
  input.value = sample.content
  tooLong.value = false
  showToast(`已切换到“${sample.title}”样例。`, 'info', 1200)
}

let streamTimer: number | null = null

function scheduleNextChunk() {
  if (!isStreaming.value)
    return

  const nextLength = Math.min(streamContent.value.length + streamSpeed.value, input.value.length)
  streamContent.value = input.value.slice(0, nextLength)

  if (nextLength >= input.value.length) {
    stopStreamRender()
    return
  }

  streamTimer = window.setTimeout(scheduleNextChunk, streamInterval.value)
}

function startStreamRender() {
  if (isStreaming.value) {
    stopStreamRender()
    return
  }

  streamContent.value = ''
  isStreaming.value = true
  scheduleNextChunk()
}

function stopStreamRender() {
  if (streamTimer !== null) {
    clearTimeout(streamTimer)
    streamTimer = null
  }
  isStreaming.value = false
}

function resetEditor() {
  applySample(selectedSampleId.value)
}

function clearEditor() {
  stopStreamRender()
  input.value = ''
}

function frameworkHref(id: FrameworkId) {
  const framework = frameworkCards.find(item => item.id === id)
  if (!framework)
    return '/test'
  return resolveFrameworkTestHref(
    framework,
    CURRENT_FRAMEWORK,
    input.value,
    typeof window !== 'undefined'
      ? { hostname: window.location.hostname, protocol: window.location.protocol }
      : undefined,
  )
}

onMounted(() => {
  const restored = restoreFromUrl()
  if (!restored) {
    const sample = sampleCards.find(item => item.id === selectedSampleId.value) ?? sampleCards[0]
    input.value = sample.content
  }
  shareUrl.value = basePageUrl()
})

watch(streamSpeed, (value) => {
  const next = clampInt(value, 1, 80, 4)
  if (next !== value)
    streamSpeed.value = next
}, { immediate: true })

watch(streamInterval, (value) => {
  const next = clampInt(value, 8, 300, 24)
  if (next !== value)
    streamInterval.value = next
}, { immediate: true })

watch(input, () => {
  tooLong.value = false
  isCopied.value = false
  if (!isStreaming.value && typeof window !== 'undefined')
    shareUrl.value = basePageUrl()
})

watch(() => renderMode.value, (mode) => {
  if (mode === 'pre')
    setCustomComponents({ code_block: PreCodeNode })
  else if (mode === 'markdown')
    setCustomComponents({ code_block: MarkdownCodeBlockNode })
  else
    setCustomComponents({ code_block: CodeBlockNode })
}, { immediate: true })

watch(mathEnabled, (enabled) => {
  if (enabled)
    enableKatex()
  else
    disableKatex()
}, { immediate: true })

watch(mermaidEnabled, (enabled) => {
  if (enabled)
    enableMermaid()
  else
    disableMermaid()
}, { immediate: true })
</script>

<template>
  <div class="test-lab">
    <div class="test-lab__glow test-lab__glow--cyan" />
    <div class="test-lab__glow test-lab__glow--amber" />

    <div class="test-lab__shell">
      <section class="hero-panel">
        <div class="hero-panel__copy">
          <span class="eyebrow">Cross-framework regression lab</span>
          <h1>Markstream Test Page</h1>
          <p>
            用同一份 markdown，快速对照 Vue 3、Vue 2 和 React 的渲染行为。
            这个页面更像一个调试驾驶舱，而不是单纯的 demo。
          </p>
        </div>

        <div class="hero-panel__metrics">
          <div class="metric-card">
            <span>当前框架</span>
            <strong>Vue 3</strong>
          </div>
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
            <strong>{{ streamProgress }}%</strong>
          </div>
        </div>

        <div class="framework-switcher">
          <a
            v-for="framework in frameworkCards"
            :key="framework.id"
            class="framework-chip"
            :class="{ 'framework-chip--current': framework.id === CURRENT_FRAMEWORK }"
            :href="frameworkHref(framework.id)"
          >
            <span class="framework-chip__label">{{ framework.label }}</span>
            <span class="framework-chip__note">{{ framework.note }}</span>
          </a>
        </div>
      </section>

      <div class="lab-layout">
        <aside class="lab-sidebar">
          <section class="panel-card">
            <div class="panel-card__head">
              <div>
                <h2>样例</h2>
                <p>快速切换不同的回归场景。</p>
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
          </section>

          <section class="panel-card">
            <div class="panel-card__head">
              <div>
                <h2>流式控制</h2>
                <p>模拟真实增量输出，检查闪烁和中间态。</p>
              </div>
              <button type="button" class="ghost-button" @click="showStreamSettings = !showStreamSettings">
                {{ showStreamSettings ? '收起' : '展开' }}
              </button>
            </div>

            <div class="control-actions">
              <button type="button" class="action-button action-button--primary" @click="startStreamRender">
                {{ isStreaming ? '停止流式渲染' : '开始流式渲染' }}
              </button>
              <button type="button" class="action-button" @click="resetEditor">
                重置样例
              </button>
              <button type="button" class="action-button" @click="clearEditor">
                清空输入
              </button>
            </div>

            <div class="progress-block">
              <div class="progress-track">
                <div class="progress-fill" :style="{ width: `${streamProgress}%` }" />
              </div>
              <div class="progress-meta">
                <span>{{ previewContent.length }} / {{ input.length || 0 }}</span>
                <span>{{ isStreaming ? 'Streaming' : 'Static preview' }}</span>
              </div>
            </div>

            <div v-if="showStreamSettings" class="control-stack">
              <label class="range-control">
                <span>每次追加字符数</span>
                <strong>{{ streamSpeed }}</strong>
                <input v-model.number="streamSpeed" type="range" min="1" max="80">
              </label>

              <label class="range-control">
                <span>更新时间间隔</span>
                <strong>{{ streamInterval }}ms</strong>
                <input v-model.number="streamInterval" type="range" min="8" max="300" step="4">
              </label>

              <div class="toggle-grid">
                <label class="toggle-item">
                  <span>代码块流式渲染</span>
                  <input v-model="codeBlockStream" type="checkbox">
                </label>
                <label class="toggle-item">
                  <span>viewportPriority</span>
                  <input v-model="viewportPriority" type="checkbox">
                </label>
                <label class="toggle-item">
                  <span>batchRendering</span>
                  <input v-model="batchRendering" type="checkbox">
                </label>
                <label class="toggle-item">
                  <span>typewriter</span>
                  <input v-model="typewriter" type="checkbox">
                </label>
                <label class="toggle-item">
                  <span>KaTeX</span>
                  <input v-model="mathEnabled" type="checkbox">
                </label>
                <label class="toggle-item">
                  <span>Mermaid</span>
                  <input v-model="mermaidEnabled" type="checkbox">
                </label>
                <label class="toggle-item">
                  <span>解析树 debug</span>
                  <input v-model="debugParse" type="checkbox">
                </label>
              </div>

              <label class="select-control">
                <span>代码块模式</span>
                <select v-model="renderMode">
                  <option value="monaco">
                    Monaco
                  </option>
                  <option value="markdown">
                    MarkdownCodeBlock
                  </option>
                  <option value="pre">
                    PreCodeNode
                  </option>
                </select>
              </label>
            </div>
          </section>

          <section class="panel-card">
            <div class="panel-card__head">
              <div>
                <h2>分享与排障</h2>
                <p>把当前输入直接带给别人复现。</p>
              </div>
            </div>

            <div class="share-actions">
              <button type="button" class="action-button action-button--primary" :disabled="isWorking" @click="generateAndCopy">
                {{ isCopied ? '已复制分享链接' : (isWorking ? '生成中...' : '复制分享链接') }}
              </button>
              <button type="button" class="action-button" @click="copyRawInput">
                复制 Issue 链接
              </button>
              <button type="button" class="action-button" @click="openIssueInNewTab">
                打开 Issue
              </button>
            </div>

            <div class="meta-list">
              <div class="meta-list__row">
                <span>当前视图</span>
                <strong>{{ renderModeLabel }}</strong>
              </div>
              <div class="meta-list__row">
                <span>分享地址</span>
                <strong>{{ shareUrl || '尚未生成' }}</strong>
              </div>
            </div>

            <div v-if="tooLong" class="info-banner info-banner--warning">
              当前内容过长，建议使用 Issue 链接分享完整输入。
            </div>
            <div v-if="notice" class="info-banner" :class="`info-banner--${noticeType}`">
              {{ notice }}
            </div>
          </section>
        </aside>

        <section class="workspace-grid">
          <article class="workspace-card">
            <header class="workspace-card__head">
              <div>
                <h2>Markdown 输入</h2>
                <p>左侧编辑，右侧马上验证渲染结果。</p>
              </div>
              <span class="mini-pill">Live editor</span>
            </header>

            <textarea
              v-model="input"
              class="editor-textarea"
              spellcheck="false"
              placeholder="在这里粘贴你的复现 markdown..."
            />

            <footer class="workspace-card__foot">
              <span>可直接粘贴 issue 复现内容</span>
              <span>{{ charCount }} chars</span>
            </footer>
          </article>

          <article class="workspace-card">
            <header class="workspace-card__head">
              <div>
                <h2>实时预览</h2>
                <p>当前模式：{{ renderModeLabel }}</p>
              </div>
              <span class="mini-pill" :class="{ 'mini-pill--active': isStreaming }">
                {{ isStreaming ? 'Streaming' : 'Ready' }}
              </span>
            </header>

            <div class="preview-surface">
              <MarkdownRender
                :content="previewContent"
                :viewport-priority="viewportPriority"
                :batch-rendering="batchRendering"
                :typewriter="typewriter"
                :code-block-stream="codeBlockStream"
                :code-block-monaco-options="testPageMonacoOptions"
                :parse-options="{ debug: debugParse }"
              />
            </div>

            <footer class="workspace-card__foot">
              <span>{{ previewContent.length }} chars rendered</span>
              <span>{{ isStreaming ? '正在逐步追加中' : '已显示完整输入' }}</span>
            </footer>
          </article>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.test-lab {
  --lab-bg: #f4f7fb;
  --lab-surface: rgba(255, 255, 255, 0.82);
  --lab-surface-strong: rgba(255, 255, 255, 0.94);
  --lab-border: rgba(15, 23, 42, 0.09);
  --lab-shadow: 0 28px 80px rgba(15, 23, 42, 0.12);
  --lab-text: #10203a;
  --lab-muted: #59708f;
  --lab-accent: #1d4ed8;
  --lab-accent-soft: rgba(29, 78, 216, 0.12);
  position: relative;
  min-height: 100vh;
  padding: 28px 18px 42px;
  background:
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 30%),
    radial-gradient(circle at 85% 12%, rgba(251, 191, 36, 0.16), transparent 28%),
    linear-gradient(180deg, #f8fbff 0%, var(--lab-bg) 100%);
  color: var(--lab-text);
  overflow: hidden;
}

.test-lab__shell {
  position: relative;
  z-index: 1;
  max-width: 1480px;
  margin: 0 auto;
  display: grid;
  gap: 22px;
}

.test-lab__glow {
  position: absolute;
  border-radius: 999px;
  filter: blur(80px);
  opacity: 0.45;
  pointer-events: none;
}

.test-lab__glow--cyan {
  top: 40px;
  left: -80px;
  width: 280px;
  height: 280px;
  background: rgba(34, 211, 238, 0.34);
}

.test-lab__glow--amber {
  right: -60px;
  bottom: 120px;
  width: 260px;
  height: 260px;
  background: rgba(251, 191, 36, 0.28);
}

.hero-panel,
.panel-card,
.workspace-card {
  background: var(--lab-surface);
  border: 1px solid var(--lab-border);
  border-radius: 28px;
  box-shadow: var(--lab-shadow);
  backdrop-filter: blur(18px);
}

.hero-panel {
  position: relative;
  overflow: hidden;
  padding: 28px;
  display: grid;
  gap: 22px;
}

.hero-panel::after {
  content: '';
  position: absolute;
  inset: auto -12% -55% auto;
  width: 360px;
  height: 360px;
  background: radial-gradient(circle, rgba(29, 78, 216, 0.12), transparent 68%);
  pointer-events: none;
}

.eyebrow {
  display: inline-flex;
  width: fit-content;
  padding: 7px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(29, 78, 216, 0.14);
  color: var(--lab-accent);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-panel h1 {
  margin: 12px 0 10px;
  font-size: clamp(2.1rem, 4vw, 3.4rem);
  line-height: 0.94;
}

.hero-panel p {
  margin: 0;
  max-width: 720px;
  color: var(--lab-muted);
  font-size: 1rem;
  line-height: 1.7;
}

.hero-panel__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.metric-card {
  padding: 16px 18px;
  border-radius: 22px;
  background: var(--lab-surface-strong);
  border: 1px solid rgba(15, 23, 42, 0.06);
}

.metric-card span {
  display: block;
  color: var(--lab-muted);
  font-size: 0.82rem;
  margin-bottom: 8px;
}

.metric-card strong {
  font-size: 1.4rem;
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
  padding: 15px 18px;
  border-radius: 22px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.78);
  color: inherit;
  text-decoration: none;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.framework-chip:hover {
  transform: translateY(-2px);
  border-color: rgba(29, 78, 216, 0.28);
  box-shadow: 0 16px 32px rgba(29, 78, 216, 0.1);
}

.framework-chip--current {
  border-color: rgba(29, 78, 216, 0.28);
  background: linear-gradient(135deg, rgba(29, 78, 216, 0.12), rgba(34, 197, 94, 0.08));
}

.framework-chip__label {
  font-weight: 700;
  font-size: 1rem;
}

.framework-chip__note {
  color: var(--lab-muted);
  font-size: 0.88rem;
}

.lab-layout {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.lab-sidebar,
.workspace-grid {
  display: grid;
  gap: 18px;
}

.panel-card {
  padding: 20px;
}

.panel-card__head,
.workspace-card__head,
.workspace-card__foot,
.progress-meta,
.meta-list__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.panel-card__head h2,
.workspace-card__head h2 {
  margin: 0;
  font-size: 1.08rem;
}

.panel-card__head p,
.workspace-card__head p,
.workspace-card__foot,
.progress-meta,
.meta-list__row,
.sample-card span {
  margin: 0;
  color: var(--lab-muted);
  font-size: 0.92rem;
  line-height: 1.5;
}

.mini-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.05);
  color: var(--lab-muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.mini-pill--active {
  background: rgba(29, 78, 216, 0.14);
  color: var(--lab-accent);
}

.sample-list,
.control-stack,
.toggle-grid,
.share-actions,
.meta-list {
  display: grid;
  gap: 12px;
}

.sample-card {
  width: 100%;
  padding: 14px 16px;
  border-radius: 20px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.72);
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease;
}

.sample-card:hover {
  transform: translateY(-2px);
}

.sample-card strong {
  display: block;
  margin-bottom: 6px;
  font-size: 0.98rem;
}

.sample-card--active {
  border-color: rgba(29, 78, 216, 0.28);
  background: linear-gradient(135deg, rgba(29, 78, 216, 0.12), rgba(255, 255, 255, 0.92));
}

.control-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.action-button,
.ghost-button {
  border: 0;
  border-radius: 16px;
  cursor: pointer;
  font: inherit;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.action-button {
  padding: 12px 14px;
  background: rgba(15, 23, 42, 0.06);
  color: var(--lab-text);
}

.action-button:hover,
.ghost-button:hover {
  transform: translateY(-1px);
}

.action-button--primary {
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  color: #fff;
  box-shadow: 0 14px 28px rgba(37, 99, 235, 0.22);
}

.action-button:disabled {
  opacity: 0.6;
  cursor: default;
  transform: none;
}

.ghost-button {
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.05);
  color: var(--lab-muted);
}

.progress-block {
  margin-top: 16px;
}

.progress-track {
  width: 100%;
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #06b6d4, #1d4ed8);
}

.progress-meta {
  margin-top: 10px;
}

.range-control,
.select-control,
.toggle-item {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(15, 23, 42, 0.06);
}

.range-control span,
.select-control span {
  color: var(--lab-muted);
  font-size: 0.88rem;
}

.toggle-item {
  grid-template-columns: 1fr auto;
  align-items: center;
}

.range-control input[type='range'] {
  width: 100%;
}

.select-control select {
  border: 0;
  border-radius: 14px;
  padding: 11px 12px;
  background: rgba(15, 23, 42, 0.05);
  color: var(--lab-text);
  font: inherit;
}

.toggle-item input[type='checkbox'] {
  width: 18px;
  height: 18px;
}

.meta-list__row {
  gap: 16px;
}

.meta-list__row strong {
  display: inline-block;
  max-width: 60%;
  font-size: 0.84rem;
  color: var(--lab-text);
  line-break: anywhere;
  text-align: right;
}

.info-banner {
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(59, 130, 246, 0.1);
  color: #1d4ed8;
  font-size: 0.9rem;
}

.info-banner--success {
  background: rgba(22, 163, 74, 0.12);
  color: #15803d;
}

.info-banner--error {
  background: rgba(220, 38, 38, 0.12);
  color: #b91c1c;
}

.info-banner--info {
  background: rgba(29, 78, 216, 0.1);
  color: #1d4ed8;
}

.info-banner--warning {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.workspace-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.workspace-card {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 760px;
}

.workspace-card__head,
.workspace-card__foot {
  padding: 18px 20px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
}

.workspace-card__foot {
  border-top: 1px solid rgba(15, 23, 42, 0.06);
  border-bottom: 0;
}

.editor-textarea {
  width: 100%;
  min-height: 560px;
  padding: 22px 20px;
  border: 0;
  resize: none;
  background:
    linear-gradient(180deg, rgba(248, 250, 252, 0.92), rgba(255, 255, 255, 0.98));
  color: #0f172a;
  font:
    500 0.95rem/1.7 "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
}

.editor-textarea:focus {
  outline: none;
}

.preview-surface {
  min-height: 560px;
  padding: 22px 20px;
  overflow: auto;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 249, 253, 0.92));
}

.preview-surface :deep(.markdown-renderer) {
  min-height: 100%;
}

@media (max-width: 1180px) {
  .lab-layout {
    grid-template-columns: 1fr;
  }

  .workspace-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 820px) {
  .test-lab {
    padding: 18px 12px 28px;
  }

  .hero-panel,
  .panel-card,
  .workspace-card {
    border-radius: 22px;
  }

  .hero-panel {
    padding: 22px 18px;
  }

  .hero-panel__metrics,
  .framework-switcher,
  .control-actions {
    grid-template-columns: 1fr;
  }

  .workspace-card {
    min-height: 640px;
  }

  .editor-textarea,
  .preview-surface {
    min-height: 420px;
  }

  .meta-list__row {
    flex-direction: column;
    align-items: flex-start;
  }

  .meta-list__row strong {
    max-width: 100%;
    text-align: left;
  }
}
</style>
