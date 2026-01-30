import { Icon } from '@iconify/react'
import { NodeRenderer, setCustomComponents, setKaTeXWorker, setMermaidWorker } from 'markstream-react'
import KatexWorker from 'markstream-react/workers/katexRenderer.worker?worker&inline'
import MermaidWorker from 'markstream-react/workers/mermaidParser.worker?worker&inline'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ThinkingNode } from './components/ThinkingNode'
import { streamContent } from './markdown'

setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())
const PLAYGROUND_CUSTOM_ID = 'playground-demo'
setCustomComponents(PLAYGROUND_CUSTOM_ID, {
  thinking: ThinkingNode,
})

const MemoizedNodeRenderer = memo(NodeRenderer)

const THEMES = [
  'andromeeda',
  'aurora-x',
  'ayu-dark',
  'catppuccin-frappe',
  'catppuccin-latte',
  'catppuccin-macchiato',
  'catppuccin-mocha',
  'dark-plus',
  'dracula',
  'dracula-soft',
  'everforest-dark',
  'everforest-light',
  'github-dark',
  'github-dark-default',
  'github-dark-dimmed',
  'github-dark-high-contrast',
  'github-light',
  'github-light-default',
  'github-light-high-contrast',
  'gruvbox-dark-hard',
  'gruvbox-dark-medium',
  'gruvbox-dark-soft',
  'gruvbox-light-hard',
  'gruvbox-light-medium',
  'gruvbox-light-soft',
  'houston',
  'kanagawa-dragon',
  'kanagawa-lotus',
  'kanagawa-wave',
  'laserwave',
  'light-plus',
  'material-theme',
  'material-theme-darker',
  'material-theme-lighter',
  'material-theme-ocean',
  'material-theme-palenight',
  'min-dark',
  'min-light',
  'monokai',
  'night-owl',
  'nord',
  'one-dark-pro',
  'one-light',
  'plastic',
  'poimandres',
  'red',
  'rose-pine',
  'rose-pine-dawn',
  'rose-pine-moon',
  'slack-dark',
  'slack-ochin',
  'snazzy-light',
  'solarized-dark',
  'solarized-light',
  'synthwave-84',
  'tokyo-night',
  'vesper',
  'vitesse-black',
  'vitesse-dark',
  'vitesse-light',
] as const

function clampChunk(value: number) {
  if (!Number.isFinite(value))
    return 1
  return Math.min(16, Math.max(1, Math.floor(value)))
}

export default function App() {
  const [content, setContent] = useState('')
  const [streamDelay, _setStreamDelay] = useState(16)
  const [streamChunkSize, _setStreamChunkSize] = useState(1)

  const normalizedChunkSize = useMemo(() => clampChunk(streamChunkSize), [streamChunkSize])
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<number | null>(null)

  const scheduleCheckMinHeight = useCallback(() => {
    if (typeof window === 'undefined')
      return
    if (frameRef.current != null)
      return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      const container = messagesRef.current
      if (!container)
        return
      const renderer = container.querySelector('.markdown-renderer') as HTMLElement | null
      if (!renderer)
        return
      const shouldDisable = renderer.scrollHeight > container.clientHeight
      if (shouldDisable) {
        renderer.classList.add('disable-min-height')
      }
      else {
        renderer.classList.remove('disable-min-height')
      }
    })
  }, [])

  useEffect(() => {
    const container = messagesRef.current
    if (!container)
      return
    scheduleCheckMinHeight()

    const roContainer = new ResizeObserver(scheduleCheckMinHeight)
    roContainer.observe(container)

    let roContent: ResizeObserver | null = null
    let lastRenderer: Element | null = null
    const observeContent = () => {
      const renderer = container.querySelector('.markdown-renderer')
      if (!renderer)
        return
      if (renderer === lastRenderer && roContent)
        return
      lastRenderer = renderer
      if (roContent)
        roContent.disconnect()
      roContent = new ResizeObserver(scheduleCheckMinHeight)
      roContent.observe(renderer)
    }
    observeContent()

    let mutationFrame: number | null = null
    const mo = new MutationObserver(() => {
      if (mutationFrame != null)
        return
      mutationFrame = window.requestAnimationFrame(() => {
        mutationFrame = null
        observeContent()
        scheduleCheckMinHeight()
      })
    })
    mo.observe(container, { childList: true, subtree: true })

    return () => {
      roContainer.disconnect()
      roContent?.disconnect()
      mo.disconnect()
      if (mutationFrame != null)
        window.cancelAnimationFrame(mutationFrame)
    }
  }, [scheduleCheckMinHeight])

  useEffect(() => {
    scheduleCheckMinHeight()
  }, [content, scheduleCheckMinHeight])

  useEffect(() => {
    return () => {
      if (frameRef.current != null)
        window.cancelAnimationFrame(frameRef.current)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined')
      return
    let timer: number | null = null
    const startStreaming = () => {
      timer = window.setInterval(() => {
        setContent((current) => {
          if (current.length >= streamContent.length) {
            if (timer != null) {
              window.clearInterval(timer)
              timer = null
            }
            return current
          }
          const nextChunk = streamContent.slice(current.length, current.length + normalizedChunkSize)
          return current + nextChunk
        })
      }, streamDelay)
    }
    startStreaming()
    return () => {
      if (timer != null)
        window.clearInterval(timer)
    }
  }, [streamDelay, normalizedChunkSize])

  const goToTest = () => {
    try {
      window.location.href = '/test'
    }
    catch {
      // noop
    }
  }

  return (
    <div className="markstream-vue h-full">
      <div className="flex items-center justify-center p-4 app-container h-full bg-gray-50 dark:bg-gray-900">

        <div className="chatbot-container max-w-5xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl dark:shadow-gray-900/50 flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="chatbot-header px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-800">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                  <Icon icon="carbon:chat" className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                    markstream-react19
                  </h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Streaming markdown demo
                  </p>
                </div>
              </div>

              <div className="flex">
                <a
                  href="https://github.com/Simon-He95/markstream-vue"
                  target="_blank"
                  rel="noreferrer"
                  className="github-star-btn flex items-center gap-2 px-3 py-1.5 bg-gray-800 dark:bg-gray-700 hover:bg-gray-700 dark:hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <Icon icon="carbon:star" className="w-4 h-4" />
                  <span>Star</span>
                </a>
                <button
                  type="button"
                  className="ml-2 test-page-btn flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  title="Go to Test page"
                  onClick={goToTest}
                >
                  <Icon icon="carbon:rocket" className="w-4 h-4" />
                  <span>Test</span>
                </button>
              </div>
            </div>
          </div>

          <main ref={messagesRef} className="chatbot-messages flex-1 overflow-y-auto mr-[1px] mb-4 flex flex-col-reverse">
            <div className="p-6">
              <MemoizedNodeRenderer
                content={content}
                codeBlockDarkTheme="vitesse-dark"
                codeBlockLightTheme="vitesse-dark"
                themes={THEMES}
                isDark={false}
                customId={PLAYGROUND_CUSTOM_ID}
                deferNodesUntilVisible={false}
                maxLiveNodes={2000}
                liveNodeBuffer={200}
                viewportPriority={false}
              />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
