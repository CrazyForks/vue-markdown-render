import type { TestLabFrameworkId, TestLabSampleId } from '../../../playground-shared/testLabFixtures'
import type { StreamPresetId } from './streamPresets'
import type { StreamSliceMode, StreamTransportMode } from './useStreamSimulator'
import { NodeRenderer } from 'markstream-react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { TEST_LAB_FRAMEWORKS, TEST_LAB_SAMPLES } from '../../../playground-shared/testLabFixtures'
import { decodeMarkdownHash, resolveFrameworkTestHref } from '../../../playground-shared/testPageState'
import { CUSTOM_STREAM_PRESET_ID, findMatchingStreamPreset, getStreamPreset, STREAM_PRESETS } from './streamPresets'
import { clampStreamControl, normalizeStreamRange, useStreamSimulator } from './useStreamSimulator'

type SampleId = TestLabSampleId
type FrameworkId = TestLabFrameworkId

const CURRENT_FRAMEWORK: FrameworkId = 'react'

const frameworkCards = TEST_LAB_FRAMEWORKS
const sampleCards = TEST_LAB_SAMPLES

interface TestLabProps {
  frameworkLabel: string
  onGoHome: () => void
}

export function TestLab({ frameworkLabel, onGoHome }: TestLabProps) {
  const [selectedSampleId, setSelectedSampleId] = useState<SampleId>('baseline')
  const [input, setInput] = useState(sampleCards[0].content)
  const [streamChunkSizeMin, setStreamChunkSizeMin] = useState(2)
  const [streamChunkSizeMax, setStreamChunkSizeMax] = useState(7)
  const [streamChunkDelayMin, setStreamChunkDelayMin] = useState(14)
  const [streamChunkDelayMax, setStreamChunkDelayMax] = useState(34)
  const [streamBurstiness, setStreamBurstiness] = useState(35)
  const [streamTransportMode, setStreamTransportMode] = useState<StreamTransportMode>('readable-stream')
  const [streamSliceMode, setStreamSliceMode] = useState<StreamSliceMode>('pure-random')

  const activeSample = sampleCards.find(sample => sample.id === selectedSampleId) ?? sampleCards[0]
  const normalizedChunkSizeRange = useMemo(() => normalizeStreamRange(
    streamChunkSizeMin,
    streamChunkSizeMax,
    1,
    80,
    2,
    7,
  ), [streamChunkSizeMax, streamChunkSizeMin])
  const normalizedChunkDelayRange = useMemo(() => normalizeStreamRange(
    streamChunkDelayMin,
    streamChunkDelayMax,
    8,
    600,
    14,
    34,
  ), [streamChunkDelayMax, streamChunkDelayMin])
  const normalizedBurstiness = useMemo(
    () => Math.round(clampStreamControl(streamBurstiness, 0, 100, 35)),
    [streamBurstiness],
  )
  const {
    content: streamContent,
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
    chunkSizeMin: normalizedChunkSizeRange.min,
    chunkSizeMax: normalizedChunkSizeRange.max,
    chunkDelayMin: normalizedChunkDelayRange.min,
    chunkDelayMax: normalizedChunkDelayRange.max,
    burstiness: normalizedBurstiness / 100,
    sliceMode: streamSliceMode,
    transportMode: streamTransportMode,
  })
  const previewContent = isStreaming ? streamContent : input
  const deferredPreview = useDeferredValue(previewContent)
  const progress = input.length ? Math.min(100, Math.round((previewContent.length / input.length) * 100)) : 0
  const charCount = input.length
  const lineCount = input ? input.split('\n').length : 0
  const activeStreamPreset = useMemo(() => findMatchingStreamPreset({
    chunkDelayMin: normalizedChunkDelayRange.min,
    chunkDelayMax: normalizedChunkDelayRange.max,
    chunkSizeMin: normalizedChunkSizeRange.min,
    chunkSizeMax: normalizedChunkSizeRange.max,
    burstiness: normalizedBurstiness,
  }), [normalizedBurstiness, normalizedChunkDelayRange.max, normalizedChunkDelayRange.min, normalizedChunkSizeRange.max, normalizedChunkSizeRange.min])
  const selectedStreamPresetId = activeStreamPreset?.id ?? CUSTOM_STREAM_PRESET_ID
  const streamPresetDescription = activeStreamPreset?.description ?? 'Current values are outside the built-in presets.'
  const streamChunkRangeLabel = `${normalizedChunkSizeRange.min}-${normalizedChunkSizeRange.max} chars`
  const streamDelayRangeLabel = `${normalizedChunkDelayRange.min}-${normalizedChunkDelayRange.max}ms`

  useEffect(() => {
    if (typeof window === 'undefined')
      return
    const restored = decodeMarkdownHash(window.location.hash || '')
    if (restored)
      setInput(restored)
  }, [])

  useEffect(() => {
    if (streamChunkSizeMin !== normalizedChunkSizeRange.min)
      setStreamChunkSizeMin(normalizedChunkSizeRange.min)
    if (streamChunkSizeMax !== normalizedChunkSizeRange.max)
      setStreamChunkSizeMax(normalizedChunkSizeRange.max)
  }, [normalizedChunkSizeRange.max, normalizedChunkSizeRange.min, streamChunkSizeMax, streamChunkSizeMin])

  useEffect(() => {
    if (streamChunkDelayMin !== normalizedChunkDelayRange.min)
      setStreamChunkDelayMin(normalizedChunkDelayRange.min)
    if (streamChunkDelayMax !== normalizedChunkDelayRange.max)
      setStreamChunkDelayMax(normalizedChunkDelayRange.max)
  }, [normalizedChunkDelayRange.max, normalizedChunkDelayRange.min, streamChunkDelayMax, streamChunkDelayMin])

  useEffect(() => {
    if (streamBurstiness !== normalizedBurstiness)
      setStreamBurstiness(normalizedBurstiness)
  }, [normalizedBurstiness, streamBurstiness])

  function applySample(id: SampleId) {
    const sample = sampleCards.find(item => item.id === id)
    if (!sample)
      return
    resetStreamState()
    setSelectedSampleId(sample.id)
    setInput(sample.content)
  }

  function toggleStream() {
    if (isStreaming) {
      stopStreaming()
      return
    }
    startStreaming()
  }

  function resetEditor() {
    applySample(selectedSampleId)
  }

  function clearEditor() {
    resetStreamState()
    setInput('')
  }

  function handleStreamPresetChange(presetId: StreamPresetId) {
    if (presetId === CUSTOM_STREAM_PRESET_ID)
      return

    const preset = getStreamPreset(presetId)
    if (!preset)
      return

    setStreamChunkDelayMin(preset.chunkDelayMin)
    setStreamChunkDelayMax(preset.chunkDelayMax)
    setStreamChunkSizeMin(preset.chunkSizeMin)
    setStreamChunkSizeMax(preset.chunkSizeMax)
    setStreamBurstiness(preset.burstiness)
  }

  function frameworkHref(id: FrameworkId) {
    const framework = frameworkCards.find(item => item.id === id)
    if (!framework)
      return '/test'
    return resolveFrameworkTestHref(
      framework,
      CURRENT_FRAMEWORK,
      input,
      typeof window !== 'undefined'
        ? { hostname: window.location.hostname, protocol: window.location.protocol }
        : undefined,
    )
  }

  return (
    <div className="test-lab">
      <div className="test-lab__shell">
        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">
              {frameworkLabel}
              {' '}
              Regression Lab
            </span>
            <h1>markstream-react /test</h1>
            <p>专门用来和 Vue 3、Vue 2、Angular 的 test page 做对照，快速定位框架层差异。</p>
          </div>

          <div className="hero-metrics">
            <div className="metric-card">
              <span>字符数</span>
              <strong>{charCount}</strong>
            </div>
            <div className="metric-card">
              <span>行数</span>
              <strong>{lineCount}</strong>
            </div>
            <div className="metric-card">
              <span>进度</span>
              <strong>
                {progress}
                %
              </strong>
            </div>
          </div>

          <div className="framework-switcher">
            {frameworkCards.map(framework => (
              <a
                key={framework.id}
                className={`framework-chip ${framework.id === CURRENT_FRAMEWORK ? 'framework-chip--current' : ''}`}
                href={frameworkHref(framework.id)}
              >
                <span className="framework-chip__label">{framework.label}</span>
                <span className="framework-chip__note">{framework.note}</span>
              </a>
            ))}
          </div>
        </section>

        <div className="lab-layout">
          <aside className="panel-card sidebar-card">
            <div className="panel-head">
              <div>
                <h2>样例切换</h2>
                <p>同一段输入，切到别的框架继续比。</p>
              </div>
              <span className="mini-pill">{activeSample.title}</span>
            </div>

            <div className="sample-list">
              {sampleCards.map(sample => (
                <button
                  key={sample.id}
                  type="button"
                  className={`sample-card ${sample.id === selectedSampleId ? 'sample-card--active' : ''}`}
                  onClick={() => applySample(sample.id)}
                >
                  <strong>{sample.title}</strong>
                  <span>{sample.summary}</span>
                </button>
              ))}
            </div>

            <div className="panel-head panel-head--spaced">
              <div>
                <h2>流式控制</h2>
                <p>检查 React 版本在纯随机 slice、停顿和 burst 下的稳定性。</p>
              </div>
            </div>

            <div className="control-grid">
              <label className="input-card">
                <span>Preset</span>
                <select
                  value={selectedStreamPresetId}
                  onChange={event => handleStreamPresetChange(event.target.value as StreamPresetId)}
                >
                  {STREAM_PRESETS.map(preset => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                  <option value={CUSTOM_STREAM_PRESET_ID}>Custom</option>
                </select>
              </label>
              <label className="input-card">
                <span>Transport</span>
                <select
                  value={streamTransportMode}
                  onChange={event => setStreamTransportMode(event.target.value as StreamTransportMode)}
                >
                  <option value="readable-stream">ReadableStream</option>
                  <option value="scheduler">Scheduler</option>
                </select>
              </label>
              <label className="input-card">
                <span>Slice Mode</span>
                <select
                  value={streamSliceMode}
                  onChange={event => setStreamSliceMode(event.target.value as StreamSliceMode)}
                >
                  <option value="pure-random">Pure Random</option>
                  <option value="boundary-aware">Boundary Aware</option>
                </select>
              </label>
              <label className="input-card">
                <span>chunkSizeMin</span>
                <input
                  type="number"
                  min={1}
                  max={80}
                  value={streamChunkSizeMin}
                  onChange={event => setStreamChunkSizeMin(Number(event.target.value))}
                />
              </label>
              <label className="input-card">
                <span>chunkSizeMax</span>
                <input
                  type="number"
                  min={1}
                  max={80}
                  value={streamChunkSizeMax}
                  onChange={event => setStreamChunkSizeMax(Number(event.target.value))}
                />
              </label>
              <label className="input-card">
                <span>chunkDelayMin</span>
                <input
                  type="number"
                  min={8}
                  max={600}
                  value={streamChunkDelayMin}
                  onChange={event => setStreamChunkDelayMin(Number(event.target.value))}
                />
              </label>
              <label className="input-card">
                <span>chunkDelayMax</span>
                <input
                  type="number"
                  min={8}
                  max={600}
                  value={streamChunkDelayMax}
                  onChange={event => setStreamChunkDelayMax(Number(event.target.value))}
                />
              </label>
              <label className="input-card">
                <span>Burstiness (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={streamBurstiness}
                  onChange={event => setStreamBurstiness(Number(event.target.value))}
                />
              </label>
            </div>

            <p className="control-note">{streamPresetDescription}</p>
            <p className="control-note">
              Active window:
              {' '}
              {streamChunkRangeLabel}
              ,
              {' '}
              {streamDelayRangeLabel}
              . When min=max, the cadence becomes fixed.
            </p>
            <p className="control-note">
              <code>Pure Random</code>
              {' '}
              uses raw random
              <code>slice</code>
              ;
              <code>Boundary Aware</code>
              {' '}
              snaps toward word and punctuation boundaries.
            </p>

            <div className="button-grid">
              <button type="button" className="testlab-btn testlab-btn--primary" onClick={toggleStream}>
                {isStreaming ? '停止流式渲染' : '开始流式渲染'}
              </button>
              <button type="button" className="testlab-btn" disabled={!isStreaming} onClick={toggleStreamingPause}>
                {isPaused ? '继续流式渲染' : '暂停流式渲染'}
              </button>
              <button type="button" className="testlab-btn" onClick={resetEditor}>
                重置样例
              </button>
              <button type="button" className="testlab-btn" onClick={clearEditor}>
                清空输入
              </button>
              <button type="button" className="testlab-btn" onClick={onGoHome}>
                返回主 demo
              </button>
            </div>
          </aside>

          <section className="workspace-grid">
            <article className="workspace-card">
              <header className="workspace-card__head">
                <div>
                  <h2>Markdown 输入</h2>
                  <p>把复现内容直接贴进来。</p>
                </div>
              </header>

              <textarea
                value={input}
                onChange={event => setInput(event.target.value)}
                className="editor-textarea"
                spellCheck={false}
                placeholder="Paste markdown here..."
              />

              <footer className="workspace-card__foot">
                <span>
                  {charCount}
                  {' '}
                  chars
                </span>
                <span>
                  {lineCount}
                  {' '}
                  lines
                </span>
              </footer>
            </article>

            <article className="workspace-card">
              <header className="workspace-card__head">
                <div>
                  <h2>实时预览</h2>
                  <p>{isStreaming ? (isPaused ? '流式已暂停' : 'Streaming 中') : '已显示完整输入'}</p>
                </div>
                <span className="mini-pill">
                  {progress}
                  %
                </span>
              </header>

              <div className="preview-surface">
                <NodeRenderer content={deferredPreview} typewriter={false} codeBlockStream />
              </div>

              <footer className="workspace-card__foot">
                <span>
                  {deferredPreview.length}
                  {' '}
                  /
                  {' '}
                  {input.length || 0}
                </span>
                <span>
                  {isStreaming ? `${streamTransportMode} · ${lastChunkSize} chars / ${lastDelayMs}ms` : 'React renderer'}
                </span>
              </footer>
            </article>
          </section>
        </div>
      </div>
    </div>
  )
}
