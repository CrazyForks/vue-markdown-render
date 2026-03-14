import { NodeRenderer } from 'markstream-react'
import { useDeferredValue, useEffect, useState } from 'react'
import { TEST_LAB_FRAMEWORKS, TEST_LAB_SAMPLES, type TestLabFrameworkId, type TestLabSampleId } from '../../../playground-shared/testLabFixtures'
import { decodeMarkdownHash, resolveFrameworkTestHref } from '../../../playground-shared/testPageState'

type SampleId = TestLabSampleId
type FrameworkId = TestLabFrameworkId

const CURRENT_FRAMEWORK: FrameworkId = 'react'

const frameworkCards = TEST_LAB_FRAMEWORKS
const sampleCards = TEST_LAB_SAMPLES

function clampInt(value: number, min: number, max: number, fallback: number) {
  const normalized = Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(max, Math.max(min, normalized))
}

interface TestLabProps {
  frameworkLabel: string
  onGoHome: () => void
}

export function TestLab({ frameworkLabel, onGoHome }: TestLabProps) {
  const [selectedSampleId, setSelectedSampleId] = useState<SampleId>('baseline')
  const [input, setInput] = useState(sampleCards[0].content)
  const [streamContent, setStreamContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamSpeed, setStreamSpeed] = useState(4)
  const [streamInterval, setStreamInterval] = useState(24)

  const activeSample = sampleCards.find(sample => sample.id === selectedSampleId) ?? sampleCards[0]
  const previewContent = isStreaming ? streamContent : input
  const deferredPreview = useDeferredValue(previewContent)
  const progress = input.length ? Math.min(100, Math.round((previewContent.length / input.length) * 100)) : 0
  const charCount = input.length
  const lineCount = input ? input.split('\n').length : 0

  useEffect(() => {
    if (typeof window === 'undefined')
      return
    const restored = decodeMarkdownHash(window.location.hash || '')
    if (restored)
      setInput(restored)
  }, [])

  useEffect(() => {
    if (!isStreaming)
      return

    const safeSpeed = clampInt(streamSpeed, 1, 80, 4)
    const safeInterval = clampInt(streamInterval, 8, 300, 24)
    const timer = window.setTimeout(() => {
      setStreamContent((current) => {
        const nextLength = Math.min(current.length + safeSpeed, input.length)
        const next = input.slice(0, nextLength)
        if (nextLength >= input.length)
          setIsStreaming(false)
        return next
      })
    }, safeInterval)

    return () => {
      window.clearTimeout(timer)
    }
  }, [input, isStreaming, streamContent, streamInterval, streamSpeed])

  function applySample(id: SampleId) {
    const sample = sampleCards.find(item => item.id === id)
    if (!sample)
      return
    setIsStreaming(false)
    setStreamContent('')
    setSelectedSampleId(sample.id)
    setInput(sample.content)
  }

  function toggleStream() {
    if (isStreaming) {
      setIsStreaming(false)
      return
    }
    setStreamContent('')
    setIsStreaming(true)
  }

  function resetEditor() {
    applySample(selectedSampleId)
  }

  function clearEditor() {
    setIsStreaming(false)
    setStreamContent('')
    setInput('')
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
            <span className="eyebrow">{frameworkLabel} Regression Lab</span>
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
              <strong>{progress}%</strong>
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
                <p>检查 React 版本在增量更新时的稳定性。</p>
              </div>
            </div>

            <div className="control-grid">
              <label className="input-card">
                <span>每次追加字符</span>
                <input
                  type="number"
                  min={1}
                  max={80}
                  value={streamSpeed}
                  onChange={event => setStreamSpeed(Number(event.target.value))}
                />
              </label>
              <label className="input-card">
                <span>更新时间间隔 (ms)</span>
                <input
                  type="number"
                  min={8}
                  max={300}
                  value={streamInterval}
                  onChange={event => setStreamInterval(Number(event.target.value))}
                />
              </label>
            </div>

            <div className="button-grid">
              <button type="button" className="testlab-btn testlab-btn--primary" onClick={toggleStream}>
                {isStreaming ? '停止流式渲染' : '开始流式渲染'}
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
                <span>{charCount} chars</span>
                <span>{lineCount} lines</span>
              </footer>
            </article>

            <article className="workspace-card">
              <header className="workspace-card__head">
                <div>
                  <h2>实时预览</h2>
                  <p>{isStreaming ? 'Streaming 中' : '已显示完整输入'}</p>
                </div>
                <span className="mini-pill">{progress}%</span>
              </header>

              <div className="preview-surface">
                <NodeRenderer content={deferredPreview} typewriter={false} codeBlockStream />
              </div>

              <footer className="workspace-card__foot">
                <span>{deferredPreview.length} / {input.length || 0}</span>
                <span>React renderer</span>
              </footer>
            </article>
          </section>
        </div>
      </div>
    </div>
  )
}
