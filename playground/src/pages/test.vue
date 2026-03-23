<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { TestLabFrameworkId, TestLabSampleId } from '../../../playground-shared/testLabFixtures'
import type { SandboxFrameworkId, SandboxRenderSource } from '../../../playground-shared/versionSandbox'
import type { StreamSliceMode } from '../composables/createLocalTextStream'
import type { StreamPresetId } from '../composables/streamPresets'
import type { StreamTransportMode } from '../composables/useStreamSimulator'
import { useDebounceFn, useLocalStorage } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TEST_LAB_FRAMEWORKS, TEST_LAB_SAMPLES } from '../../../playground-shared/testLabFixtures'
import { decodeMarkdownHash, encodeMarkdownPayload, resolveFrameworkTestHref, withMarkdownHash } from '../../../playground-shared/testPageState'
import {
  buildTestSandboxHref,
  normalizeSandboxSource,
  resolveSandboxSelection,

} from '../../../playground-shared/versionSandbox'
import CodeBlockNode from '../../../src/components/CodeBlockNode'
import { getUseMonaco } from '../../../src/components/CodeBlockNode/monaco'
import MarkdownCodeBlockNode from '../../../src/components/MarkdownCodeBlockNode'
import { disableKatex, enableKatex, isKatexEnabled } from '../../../src/components/MathInlineNode/katex'
import { disableMermaid, enableMermaid, isMermaidEnabled } from '../../../src/components/MermaidBlockNode/mermaid'
import MarkdownRender from '../../../src/components/NodeRenderer'
import PreCodeNode from '../../../src/components/PreCodeNode'
import { setCustomComponents } from '../../../src/utils/nodeComponents'
import ThinkingNode from '../components/ThinkingNode.vue'
import KatexWorker from '../../../src/workers/katexRenderer.worker?worker&inline'
import { setKaTeXWorker } from '../../../src/workers/katexWorkerClient'
import MermaidWorker from '../../../src/workers/mermaidParser.worker?worker&inline'
import { setMermaidWorker } from '../../../src/workers/mermaidWorkerClient'
import { CUSTOM_STREAM_PRESET_ID, findMatchingStreamPreset, getStreamPreset, STREAM_PRESETS } from '../composables/streamPresets'
import { clampStreamControl, normalizeStreamRange, useStreamSimulator } from '../composables/useStreamSimulator'
import { testSandboxFrameworks } from '../testSandboxConfig'
import 'katex/dist/katex.min.css'

type SampleId = TestLabSampleId
type FrameworkId = TestLabFrameworkId

const CURRENT_FRAMEWORK: FrameworkId = 'vue3'

const frameworkCards = TEST_LAB_FRAMEWORKS
const sampleCards = TEST_LAB_SAMPLES

const diffHideUnchangedRegions = {
  enabled: true,
  contextLineCount: 2,
  minimumLineCount: 4,
  revealLineCount: 5,
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
const streamChunkSizeMin = useLocalStorage<number>('vmr-test-stream-chunk-size-min', 2)
const streamChunkSizeMax = useLocalStorage<number>('vmr-test-stream-chunk-size-max', 7)
const streamChunkDelayMin = useLocalStorage<number>('vmr-test-stream-delay-min', 14)
const streamChunkDelayMax = useLocalStorage<number>('vmr-test-stream-delay-max', 34)
const streamBurstiness = useLocalStorage<number>('vmr-test-stream-burstiness', 35)
const streamTransportMode = useLocalStorage<StreamTransportMode>('vmr-test-stream-transport-mode', 'readable-stream')
const streamSliceMode = useLocalStorage<StreamSliceMode>('vmr-test-stream-slice-mode', 'pure-random')
const streamDebug = useLocalStorage<boolean>('vmr-test-stream-debug', false)
const showStreamSettings = useLocalStorage<boolean>('vmr-test-show-settings', true)
const isDark = useLocalStorage<boolean>('vmr-test-dark', false)

const renderMode = useLocalStorage<'monaco' | 'pre' | 'markdown'>('vmr-test-render-mode', 'monaco')
const codeBlockStream = useLocalStorage<boolean>('vmr-test-code-stream', true)
const viewportPriority = useLocalStorage<boolean>('vmr-test-viewport-priority', true)
const batchRendering = useLocalStorage<boolean>('vmr-test-batch-rendering', true)
const typewriter = useLocalStorage<boolean>('vmr-test-typewriter', true)
const debugParse = useLocalStorage<boolean>('vmr-test-debug-parse', false)
const mathEnabled = useLocalStorage<boolean>('vmr-test-math-enabled', isKatexEnabled())
const mermaidEnabled = useLocalStorage<boolean>('vmr-test-mermaid-enabled', isMermaidEnabled())
const testPageCustomHtmlTags = ['think', 'thinking'] as const

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
const previewCardRef = ref<HTMLElement | null>(null)
const isPreviewFullscreen = ref(false)
const MAX_URL_LEN = 2000

const activeSample = computed(() => sampleCards.find(sample => sample.id === selectedSampleId.value) ?? sampleCards[0])
const normalizedChunkSizeRange = computed(() => normalizeStreamRange(
  Number(streamChunkSizeMin.value),
  Number(streamChunkSizeMax.value),
  1,
  80,
  2,
  7,
))
const normalizedChunkDelayRange = computed(() => normalizeStreamRange(
  Number(streamChunkDelayMin.value),
  Number(streamChunkDelayMax.value),
  8,
  600,
  14,
  34,
))
const {
  content: streamContent,
  chunks: streamChunks,
  isPaused,
  isStreaming,
  lastChunkSize,
  lastDelayMs,
  reset: resetStreamState,
  start: startStreaming,
  stop: stopStreaming,
  togglePause: toggleStreamingPause,
} = useStreamSimulator({
  source: input,
  chunkSizeMin: computed(() => normalizedChunkSizeRange.value.min),
  chunkSizeMax: computed(() => normalizedChunkSizeRange.value.max),
  chunkDelayMin: computed(() => normalizedChunkDelayRange.value.min),
  chunkDelayMax: computed(() => normalizedChunkDelayRange.value.max),
  burstiness: computed(() => streamBurstiness.value / 100),
  sliceMode: streamSliceMode,
  transportMode: streamTransportMode,
})
const previewContent = computed(() => (isStreaming.value ? streamContent.value : input.value))
const streamProgress = computed(() => {
  if (!input.value.length)
    return 0
  return Math.min(100, Math.round((previewContent.value.length / input.value.length) * 100))
})
const activeStreamPreset = computed(() => findMatchingStreamPreset({
  chunkDelayMin: normalizedChunkDelayRange.value.min,
  chunkDelayMax: normalizedChunkDelayRange.value.max,
  chunkSizeMin: normalizedChunkSizeRange.value.min,
  chunkSizeMax: normalizedChunkSizeRange.value.max,
  burstiness: streamBurstiness.value,
}))
const selectedStreamPresetId = computed<StreamPresetId>({
  get: () => activeStreamPreset.value?.id ?? CUSTOM_STREAM_PRESET_ID,
  set: (presetId) => {
    if (presetId === CUSTOM_STREAM_PRESET_ID)
      return

    const preset = getStreamPreset(presetId)
    if (!preset)
      return

    streamChunkDelayMin.value = preset.chunkDelayMin
    streamChunkDelayMax.value = preset.chunkDelayMax
    streamChunkSizeMin.value = preset.chunkSizeMin
    streamChunkSizeMax.value = preset.chunkSizeMax
    streamBurstiness.value = preset.burstiness
  },
})
const streamPresetDescription = computed(() => activeStreamPreset.value?.descriptionZh ?? '当前参数已偏离预设，属于自定义 min/max 流式画像。')
const streamChunkRangeLabel = computed(() => `${normalizedChunkSizeRange.value.min}-${normalizedChunkSizeRange.value.max} 字`)
const streamDelayRangeLabel = computed(() => `${normalizedChunkDelayRange.value.min}-${normalizedChunkDelayRange.value.max}ms`)
const streamModeLabel = computed(() => streamTransportMode.value === 'readable-stream' ? 'ReadableStream' : 'Scheduler')
const renderModeLabel = computed(() => {
  if (renderMode.value === 'markdown')
    return 'MarkdownCodeBlock'
  if (renderMode.value === 'pre')
    return 'PreCodeNode'
  return 'Monaco'
})
const charCount = computed(() => input.value.length)
const lineCount = computed(() => (input.value ? input.value.split('\n').length : 0))

const sandboxFrameworkId = useLocalStorage<SandboxFrameworkId>('vmr-test-sandbox-framework', 'vue3')
const sandboxSource = useLocalStorage<SandboxRenderSource>('vmr-test-sandbox-source', 'workspace')
const sandboxVersion = useLocalStorage<string>('vmr-test-sandbox-version', testSandboxFrameworks[0].defaultVersion)
const sandboxAutoSync = useLocalStorage<boolean>('vmr-test-sandbox-auto-sync', false)
const sandboxSnapshot = ref<string>(sampleCards[0].content)
const sandboxFrameKey = ref(0)

const activeSandbox = computed(() => resolveSandboxSelection(testSandboxFrameworks, {
  frameworkId: sandboxFrameworkId.value,
  source: sandboxSource.value,
  version: sandboxVersion.value,
}))
const activeSandboxFramework = computed(() => activeSandbox.value.framework)
const sandboxHref = computed(() => buildTestSandboxHref(activeSandbox.value, sandboxSnapshot.value))
const sandboxDirty = computed(() => sandboxSnapshot.value !== input.value)
const sandboxQuickVersions = computed(() => Array.from(new Set([
  activeSandboxFramework.value.defaultVersion,
  'latest',
])))
const sandboxVersionPlaceholder = computed(() => `例如 ${activeSandboxFramework.value.defaultVersion} 或 latest`)
const sandboxPackageLabel = computed(() => {
  if (activeSandbox.value.source === 'workspace')
    return `${activeSandboxFramework.value.packageName} (workspace)`
  return `${activeSandboxFramework.value.packageName}@${activeSandbox.value.version}`
})
const sandboxRuntimeLabel = computed(() => {
  if (activeSandbox.value.source === 'workspace')
    return `${activeSandboxFramework.value.label} local runtime`
  return `${activeSandboxFramework.value.label} runtime ${activeSandboxFramework.value.runtimeVersion}`
})
const sandboxStatusLabel = computed(() => {
  if (sandboxDirty.value)
    return '待同步'
  return '已同步'
})

function syncSandbox() {
  sandboxSnapshot.value = input.value
  sandboxFrameKey.value += 1
}

const syncSandboxDebounced = useDebounceFn(() => {
  syncSandbox()
}, 420)

function chooseSandboxSource(source: SandboxRenderSource) {
  sandboxSource.value = normalizeSandboxSource(activeSandboxFramework.value, source)
}

function chooseSandboxVersion(version: string) {
  sandboxVersion.value = version
}

function openSandboxInNewTab() {
  try {
    window.open(sandboxHref.value, '_blank', 'noopener')
  }
  catch {
    window.location.href = sandboxHref.value
  }
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

function syncPreviewFullscreenState() {
  isPreviewFullscreen.value = document.fullscreenElement === previewCardRef.value
}

async function togglePreviewFullscreen() {
  const previewCard = previewCardRef.value
  if (!previewCard)
    return

  if (document.fullscreenElement === previewCard) {
    if (!document.exitFullscreen)
      return

    await document.exitFullscreen()
    return
  }

  if (!previewCard.requestFullscreen)
    return

  await previewCard.requestFullscreen()
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

function startStreamRender() {
  if (isStreaming.value) {
    stopStreamRender()
    return
  }

  startStreaming()
}

function stopStreamRender() {
  stopStreaming()
}

function resetEditor() {
  applySample(selectedSampleId.value)
}

function clearEditor() {
  resetStreamState()
  input.value = ''
}

function toggleAppearance() {
  isDark.value = !isDark.value
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
  sandboxSnapshot.value = input.value
  syncPreviewFullscreenState()
  document.addEventListener('fullscreenchange', syncPreviewFullscreenState)
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncPreviewFullscreenState)
})

watch(normalizedChunkSizeRange, (range) => {
  if (streamChunkSizeMin.value !== range.min)
    streamChunkSizeMin.value = range.min
  if (streamChunkSizeMax.value !== range.max)
    streamChunkSizeMax.value = range.max
}, { immediate: true })

watch(normalizedChunkDelayRange, (range) => {
  if (streamChunkDelayMin.value !== range.min)
    streamChunkDelayMin.value = range.min
  if (streamChunkDelayMax.value !== range.max)
    streamChunkDelayMax.value = range.max
}, { immediate: true })

watch(streamBurstiness, (value) => {
  const next = Math.round(clampStreamControl(value, 0, 100, 35))
  if (next !== value)
    streamBurstiness.value = next
}, { immediate: true })

watch(input, () => {
  tooLong.value = false
  isCopied.value = false
  if (!isStreaming.value && typeof window !== 'undefined')
    shareUrl.value = basePageUrl()
  if (sandboxAutoSync.value)
    syncSandboxDebounced()
})

watch(sandboxAutoSync, (enabled) => {
  if (enabled)
    syncSandbox()
})

watch(() => sandboxFrameworkId.value, () => {
  const framework = testSandboxFrameworks.find(item => item.id === sandboxFrameworkId.value) ?? testSandboxFrameworks[0]
  sandboxSource.value = normalizeSandboxSource(framework, sandboxSource.value)
  sandboxVersion.value = framework.defaultVersion
  syncSandboxDebounced()
})

watch(() => sandboxSource.value, (source) => {
  const normalized = normalizeSandboxSource(activeSandboxFramework.value, source)
  if (normalized !== source) {
    sandboxSource.value = normalized
    return
  }
  syncSandboxDebounced()
})

watch(() => sandboxVersion.value, () => {
  syncSandboxDebounced()
})

watch(() => renderMode.value, (mode) => {
  if (mode === 'pre')
    setCustomComponents({ code_block: PreCodeNode, think: ThinkingNode, thinking: ThinkingNode })
  else if (mode === 'markdown')
    setCustomComponents({ code_block: MarkdownCodeBlockNode, think: ThinkingNode, thinking: ThinkingNode })
  else
    setCustomComponents({ code_block: CodeBlockNode, think: ThinkingNode, thinking: ThinkingNode })
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
  <div class="test-lab" :class="{ 'test-lab--dark': isDark, dark: isDark }">
    <div class="test-lab__glow test-lab__glow--cyan" />
    <div class="test-lab__glow test-lab__glow--amber" />

    <div class="test-lab__shell">
      <section class="hero-panel">
        <div class="hero-panel__copy">
          <span class="eyebrow">Cross-framework regression lab</span>
          <h1>Markstream Test Page</h1>
          <p>
            直接粘贴 markdown，即时预览渲染结果；需要排障时，再用同一份输入快速对照
            Vue 3、Vue 2、React 和 Angular 的渲染行为。
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
                <p>模拟真实增量输出，把抖动、停顿和 burst 一起带进来。</p>
              </div>
              <button type="button" class="ghost-button" @click="showStreamSettings = !showStreamSettings">
                {{ showStreamSettings ? '收起' : '展开' }}
              </button>
            </div>

            <div class="control-actions">
              <button type="button" class="action-button action-button--primary" @click="startStreamRender">
                {{ isStreaming ? '停止流式渲染' : '开始流式渲染' }}
              </button>
              <button type="button" class="action-button" :disabled="!isStreaming" @click="toggleStreamingPause">
                {{ isPaused ? '继续流式渲染' : '暂停流式渲染' }}
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
                <span>{{ isStreaming ? `${streamModeLabel} · 最近一次 ${lastChunkSize} 字 / ${lastDelayMs}ms` : 'Static preview' }}</span>
              </div>
            </div>

            <div v-if="showStreamSettings" class="control-stack">
              <label class="select-control">
                <span>Transport</span>
                <select v-model="streamTransportMode">
                  <option value="readable-stream">
                    ReadableStream
                  </option>
                  <option value="scheduler">
                    Scheduler
                  </option>
                </select>
              </label>

              <label class="select-control">
                <span>Slice Mode</span>
                <select v-model="streamSliceMode">
                  <option value="pure-random">
                    Pure Random
                  </option>
                  <option value="boundary-aware">
                    Boundary Aware
                  </option>
                </select>
              </label>

              <label class="select-control">
                <span>流式画像 preset</span>
                <select v-model="selectedStreamPresetId">
                  <option v-for="preset in STREAM_PRESETS" :key="preset.id" :value="preset.id">
                    {{ preset.label }}
                  </option>
                  <option :value="CUSTOM_STREAM_PRESET_ID">
                    Custom
                  </option>
                </select>
              </label>

              <p class="control-note">
                {{ streamPresetDescription }}
              </p>

              <label class="range-control">
                <span>chunkSizeMin</span>
                <strong>{{ normalizedChunkSizeRange.min }}</strong>
                <input v-model.number="streamChunkSizeMin" type="range" min="1" max="80" step="1">
              </label>

              <label class="range-control">
                <span>chunkSizeMax</span>
                <strong>{{ normalizedChunkSizeRange.max }}</strong>
                <input v-model.number="streamChunkSizeMax" type="range" min="1" max="80" step="1">
              </label>

              <label class="range-control">
                <span>chunkDelayMin</span>
                <strong>{{ normalizedChunkDelayRange.min }}ms</strong>
                <input v-model.number="streamChunkDelayMin" type="range" min="8" max="600" step="4">
              </label>

              <label class="range-control">
                <span>chunkDelayMax</span>
                <strong>{{ normalizedChunkDelayRange.max }}ms</strong>
                <input v-model.number="streamChunkDelayMax" type="range" min="8" max="600" step="4">
              </label>

              <label class="range-control">
                <span>突发/停顿强度</span>
                <strong>{{ streamBurstiness }}%</strong>
                <input v-model.number="streamBurstiness" type="range" min="0" max="100" step="1">
              </label>

              <p class="control-note">
                当前窗口：{{ streamChunkRangeLabel }}，{{ streamDelayRangeLabel }}。当 min=max 时就是固定节奏。
              </p>

              <p class="control-note">
                `Pure Random` 会直接按随机长度做原始 `slice`；`Boundary Aware` 会尽量贴近单词或标点边界。
              </p>

              <p class="control-note">
                `ReadableStream` 更接近真实 reader 消费链路；`Scheduler` 保留我们本地定时调度模型。burstiness 只会影响非纯随机调度。
              </p>

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
                <label class="toggle-item">
                  <span>chunk debug</span>
                  <input v-model="streamDebug" type="checkbox">
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
                <h2>版本沙箱</h2>
                <p>指定 framework、source 和包版本，在独立 iframe 里对照渲染。</p>
              </div>
              <span class="mini-pill">{{ sandboxStatusLabel }}</span>
            </div>

            <div class="control-stack">
              <label class="select-control">
                <span>目标框架</span>
                <select v-model="sandboxFrameworkId">
                  <option
                    v-for="framework in testSandboxFrameworks"
                    :key="framework.id"
                    :value="framework.id"
                  >
                    {{ framework.label }}
                  </option>
                </select>
              </label>

              <div class="segmented-control">
                <button
                  type="button"
                  class="segmented-control__button"
                  :class="{ 'segmented-control__button--active': activeSandbox.source === 'workspace' }"
                  :disabled="!activeSandboxFramework.supportsWorkspace"
                  @click="chooseSandboxSource('workspace')"
                >
                  workspace
                </button>
                <button
                  type="button"
                  class="segmented-control__button"
                  :class="{ 'segmented-control__button--active': activeSandbox.source === 'npm' }"
                  @click="chooseSandboxSource('npm')"
                >
                  npm
                </button>
              </div>

              <div class="preset-list">
                <button
                  v-for="version in sandboxQuickVersions"
                  :key="version"
                  type="button"
                  class="preset-chip"
                  :class="{ 'preset-chip--active': sandboxVersion === version }"
                  @click="chooseSandboxVersion(version)"
                >
                  {{ version }}
                </button>
              </div>

              <label class="text-control">
                <span>包版本</span>
                <input
                  v-model="sandboxVersion"
                  type="text"
                  :placeholder="sandboxVersionPlaceholder"
                >
              </label>

              <label class="toggle-item">
                <span>输入变化自动同步到 iframe</span>
                <input v-model="sandboxAutoSync" type="checkbox">
              </label>
            </div>

            <div class="control-actions control-actions--stacked">
              <button type="button" class="action-button action-button--primary" @click="syncSandbox">
                刷新沙箱
              </button>
              <button type="button" class="action-button" @click="openSandboxInNewTab">
                独立打开
              </button>
            </div>

            <div class="meta-list">
              <div class="meta-list__row">
                <span>渲染目标</span>
                <strong>{{ sandboxPackageLabel }}</strong>
              </div>
              <div class="meta-list__row">
                <span>运行时</span>
                <strong>{{ sandboxRuntimeLabel }}</strong>
              </div>
            </div>

            <div v-if="!activeSandboxFramework.supportsWorkspace" class="info-banner info-banner--info">
              {{ activeSandboxFramework.label }} 在这个沙箱里先走 npm 包模式；本地 workspace 对照仍可用上方 framework 切页。
            </div>
            <div v-if="sandboxDirty" class="info-banner info-banner--warning">
              右侧 iframe 还没同步最新输入，点“刷新沙箱”即可用当前 markdown 重载。
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
          <article class="workspace-card workspace-card--pane">
            <header class="workspace-card__head">
              <div>
                <h2>Markdown 输入</h2>
                <p>把 markdown 粘进来，右侧立即看到真实渲染结果。</p>
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

          <article ref="previewCardRef" class="workspace-card workspace-card--pane workspace-card--preview">
            <header class="workspace-card__head">
              <div>
                <h2>实时预览</h2>
                <p>
                  当前模式：{{ renderModeLabel }}{{ isPreviewFullscreen ? ' · 按 Esc 退出全屏' : '' }}
                </p>
              </div>
              <div class="workspace-card__head-actions">
                <button
                  type="button"
                  class="ghost-button icon-button"
                  data-testid="theme-toggle-button"
                  :aria-label="isDark ? '切换到浅色模式' : '切换到暗色模式'"
                  :title="isDark ? '切换到浅色模式' : '切换到暗色模式'"
                  @click="toggleAppearance"
                >
                  <Icon
                    :icon="isDark ? 'carbon:moon' : 'carbon:sun'"
                    class="icon-button__icon"
                  />
                </button>
                <button
                  type="button"
                  class="ghost-button"
                  data-testid="preview-fullscreen-button"
                  :aria-pressed="isPreviewFullscreen"
                  @click="togglePreviewFullscreen"
                >
                  {{ isPreviewFullscreen ? '退出全屏' : '全屏预览' }}
                </button>
                <span class="mini-pill" :class="{ 'mini-pill--active': isStreaming }">
                  {{ isStreaming ? 'Streaming' : 'Ready' }}
                </span>
              </div>
            </header>

            <div class="preview-surface">
              <MarkdownRender
                :content="previewContent"
                :custom-html-tags="testPageCustomHtmlTags"
                :is-dark="isDark"
                :viewport-priority="viewportPriority"
                :batch-rendering="batchRendering"
                :typewriter="typewriter"
                :code-block-stream="codeBlockStream"
                code-block-dark-theme="vitesse-dark"
                code-block-light-theme="vitesse-light"
                :code-block-monaco-options="testPageMonacoOptions"
                :parse-options="{ debug: debugParse }"
              />
            </div>

            <footer class="workspace-card__foot">
              <span>{{ previewContent.length }} chars rendered</span>
              <span>{{ isStreaming ? (isPaused ? '流式已暂停' : '正在逐步追加中') : '已显示完整输入' }}</span>
            </footer>
          </article>

          <article v-if="streamDebug && streamChunks.length" class="workspace-card workspace-card--full">
            <header class="workspace-card__head">
              <div>
                <h2>Chunk Debug</h2>
                <p>逐块查看 delay、slice 内容和累计节奏。</p>
              </div>
              <span class="mini-pill">{{ streamChunks.length }} chunks</span>
            </header>

            <div class="chunk-log">
              <div v-for="chunk in streamChunks" :key="chunk.index" class="chunk-log__row">
                <strong>#{{ chunk.index }}</strong>
                <span>{{ chunk.delay }}ms</span>
                <code>{{ JSON.stringify(chunk.content) }}</code>
              </div>
            </div>
          </article>

          <article class="workspace-card workspace-card--full">
            <header class="workspace-card__head">
              <div>
                <h2>版本沙箱预览</h2>
                <p>独立 iframe，真正按 framework 与版本重新挂载渲染器。</p>
              </div>
              <span class="mini-pill" :class="{ 'mini-pill--active': !sandboxDirty }">
                {{ sandboxStatusLabel }}
              </span>
            </header>

            <div class="sandbox-frame-shell">
              <iframe
                :key="sandboxFrameKey"
                class="sandbox-frame"
                :src="sandboxHref"
                title="Markstream version sandbox"
                loading="lazy"
              />
            </div>

            <footer class="workspace-card__foot">
              <span>{{ sandboxPackageLabel }}</span>
              <span>{{ sandboxDirty ? '等待手动同步' : '已加载当前输入快照' }}</span>
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
  --workspace-pane-height: clamp(540px, 72vh, 880px);
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

.test-lab--dark {
  --lab-bg: #08111f;
  --lab-surface: rgba(9, 18, 32, 0.82);
  --lab-surface-strong: rgba(15, 23, 42, 0.94);
  --lab-border: rgba(148, 163, 184, 0.14);
  --lab-shadow: 0 28px 80px rgba(2, 6, 23, 0.45);
  --lab-text: #e2e8f0;
  --lab-muted: #94a3b8;
  --lab-accent: #60a5fa;
  --lab-accent-soft: rgba(96, 165, 250, 0.16);
  color-scheme: dark;
  background:
    radial-gradient(circle at top left, rgba(14, 165, 233, 0.16), transparent 30%),
    radial-gradient(circle at 85% 12%, rgba(245, 158, 11, 0.12), transparent 28%),
    linear-gradient(180deg, #0b1220 0%, var(--lab-bg) 100%);
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

.test-lab--dark .eyebrow {
  background: rgba(15, 23, 42, 0.84);
  border-color: rgba(96, 165, 250, 0.22);
  color: #93c5fd;
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
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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

.test-lab--dark .metric-card,
.test-lab--dark .framework-chip,
.test-lab--dark .sample-card,
.test-lab--dark .range-control,
.test-lab--dark .select-control,
.test-lab--dark .toggle-item,
.test-lab--dark .text-control,
.test-lab--dark .segmented-control__button,
.test-lab--dark .preset-chip {
  background: rgba(15, 23, 42, 0.78);
  border-color: rgba(148, 163, 184, 0.12);
}

.test-lab--dark .framework-chip--current,
.test-lab--dark .sample-card--active,
.test-lab--dark .segmented-control__button--active,
.test-lab--dark .preset-chip--active {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.22), rgba(15, 23, 42, 0.92));
  border-color: rgba(96, 165, 250, 0.3);
  color: #bfdbfe;
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

.workspace-card__head {
  flex-wrap: wrap;
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

.control-actions--stacked {
  margin-top: 14px;
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

.test-lab--dark .action-button:not(.action-button--primary),
.test-lab--dark .ghost-button {
  background: rgba(30, 41, 59, 0.84);
  color: #cbd5e1;
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

.test-lab--dark .progress-track {
  background: rgba(51, 65, 85, 0.7);
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

.control-note {
  margin: 0;
  padding: 0 4px;
  color: var(--lab-muted);
  font-size: 0.82rem;
  line-height: 1.6;
}

.select-control select {
  border: 0;
  border-radius: 14px;
  padding: 11px 12px;
  background: rgba(15, 23, 42, 0.05);
  color: var(--lab-text);
  font: inherit;
}

.text-control {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(15, 23, 42, 0.06);
}

.text-control span {
  color: var(--lab-muted);
  font-size: 0.88rem;
}

.text-control input {
  border: 0;
  border-radius: 14px;
  padding: 11px 12px;
  background: rgba(15, 23, 42, 0.05);
  color: var(--lab-text);
  font: inherit;
}

.text-control input:focus {
  outline: none;
}

.test-lab--dark .select-control select,
.test-lab--dark .text-control input {
  background: rgba(30, 41, 59, 0.9);
  color: #e2e8f0;
}

.segmented-control {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.segmented-control__button,
.preset-chip {
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.78);
  color: var(--lab-text);
  border-radius: 16px;
  cursor: pointer;
  font: inherit;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease;
}

.segmented-control__button {
  padding: 11px 12px;
}

.preset-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.preset-chip {
  padding: 8px 12px;
}

.segmented-control__button:hover,
.preset-chip:hover {
  transform: translateY(-1px);
}

.segmented-control__button--active,
.preset-chip--active {
  border-color: rgba(29, 78, 216, 0.28);
  background: rgba(29, 78, 216, 0.12);
  color: var(--lab-accent);
}

.segmented-control__button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
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

.test-lab--dark .mini-pill {
  background: rgba(30, 41, 59, 0.9);
  color: #cbd5e1;
}

.test-lab--dark .mini-pill--active {
  background: rgba(37, 99, 235, 0.2);
  color: #bfdbfe;
}

.workspace-card__head-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
}

.icon-button__icon {
  width: 18px;
  height: 18px;
}

.workspace-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.workspace-card {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-height: 760px;
}

.workspace-card--full {
  grid-column: 1 / -1;
  min-height: 720px;
}

.workspace-card--pane {
  height: var(--workspace-pane-height);
  min-height: var(--workspace-pane-height);
  max-height: var(--workspace-pane-height);
  overflow: hidden;
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

.workspace-card--pane .editor-textarea,
.workspace-card--pane .preview-surface {
  min-height: 0;
  height: 100%;
}

.test-lab--dark .editor-textarea {
  background: linear-gradient(180deg, rgba(2, 6, 23, 0.96), rgba(15, 23, 42, 0.94));
  color: #e2e8f0;
}

.test-lab--dark .preview-surface {
  background: linear-gradient(180deg, rgba(2, 6, 23, 0.98), rgba(15, 23, 42, 0.96));
}

.workspace-card--preview:fullscreen {
  width: 100%;
  height: 100%;
  max-width: none;
  min-height: 100vh;
  border-radius: 0;
  box-shadow: none;
  overflow: hidden;
  background: #fff;
}

.workspace-card--preview:fullscreen::backdrop {
  background: rgba(15, 23, 42, 0.78);
}

.workspace-card--preview:fullscreen .workspace-card__head,
.workspace-card--preview:fullscreen .workspace-card__foot {
  display: none;
}

.workspace-card--preview:fullscreen .preview-surface {
  min-height: 100vh;
  height: 100vh;
  padding: 40px min(6vw, 72px);
  background: #fff;
}

.test-lab--dark .workspace-card--preview:fullscreen {
  background: #020617;
}

.test-lab--dark .workspace-card--preview:fullscreen .preview-surface {
  background: #020617;
}

.sandbox-frame-shell {
  min-height: 620px;
  background:
    linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(239, 246, 255, 0.9));
}

.test-lab--dark .sandbox-frame-shell {
  background: linear-gradient(180deg, rgba(2, 6, 23, 0.96), rgba(15, 23, 42, 0.92));
}

.sandbox-frame {
  display: block;
  width: 100%;
  min-height: 620px;
  border: 0;
  background: transparent;
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
    --workspace-pane-height: clamp(420px, 68vh, 680px);
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

  .workspace-card--full,
  .sandbox-frame,
  .sandbox-frame-shell {
    min-height: 540px;
  }

  .editor-textarea,
  .preview-surface {
    min-height: 420px;
  }

  .workspace-card__head-actions {
    width: 100%;
    justify-content: flex-start;
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
