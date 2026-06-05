import MarkdownRender from 'markstream-vue'
import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Streamdown } from 'streamdown'
import { createApp, defineComponent, h, nextTick, onMounted, ref } from 'vue'
import 'markstream-vue/index.css'
import 'streamdown/styles.css'
import './style.css'

const params = new URLSearchParams(window.location.search)
const renderer = params.get('renderer') || 'markstream'
const variant = params.get('variant') || 'incremental'

function countElements(root) {
  const tags = ['h1', 'h2', 'h3', 'p', 'ul', 'li', 'table', 'tr', 'th', 'td', 'pre', 'code', 'blockquote', 'svg', 'button']
  return Object.fromEntries(tags.map(tag => [tag, root.querySelectorAll(tag).length]))
}

function installBenchmark(getContent, setContent) {
  window.__runBenchmark = async ({ chunks, intervalMs }) => {
    const root = document.querySelector('.bench-host')
    setContent('')
    await nextTick()

    const updateDurations = []
    const heightSamples = []
    let longTaskCount = 0
    let longTaskTotalMs = 0
    let mutationCount = 0
    const observer = new MutationObserver((records) => {
      mutationCount += records.length
    })
    observer.observe(root, { childList: true, subtree: true, characterData: true })
    const perfObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTaskCount += 1
        longTaskTotalMs += entry.duration
      }
    })
    try {
      perfObserver.observe({ entryTypes: ['longtask'] })
    }
    catch {}

    const start = performance.now()
    for (const chunk of chunks) {
      const updateStart = performance.now()
      await setContent(getContent() + chunk)
      await nextTick()
      updateDurations.push(performance.now() - updateStart)
      heightSamples.push(root.scrollHeight)
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
    await nextTick()
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const totalMs = performance.now() - start
    const sorted = updateDurations.slice().sort((a, b) => a - b)
    const heightJumps = heightSamples.reduce((count, value, index, array) => {
      return index > 0 && Math.abs(value - array[index - 1]) > 24 ? count + 1 : count
    }, 0)
    mutationCount += observer.takeRecords().length
    observer.disconnect()
    perfObserver.disconnect()

    return {
      chunks: chunks.length,
      totalMs,
      p95UpdateMs: sorted[Math.floor(sorted.length * 0.95)] || 0,
      maxUpdateMs: Math.max(...updateDurations),
      avgUpdateMs: updateDurations.reduce((sum, value) => sum + value, 0) / updateDurations.length,
      longTaskCount,
      longTaskTotalMs,
      mutationCount,
      domNodes: root.querySelectorAll('*').length,
      elementCounts: countElements(root),
      heightJumps,
    }
  }
}

const StreamdownApp = defineComponent({
  setup() {
    const content = ref('')
    onMounted(() => {
      const host = document.querySelector('.react-host')
      const reactRoot = createRoot(host)
      const render = () => {
        reactRoot.render(React.createElement(Streamdown, {
          animated: true,
          isAnimating: true,
          mode: 'streaming',
          lineNumbers: false,
        }, content.value))
      }
      render()
      installBenchmark(() => content.value, (value) => {
        content.value = value
        flushSync(render)
      })
      window.__ready = true
    })
    return () => h('main', { class: 'bench-shell' }, [
      h('section', { class: 'bench-host react-host' }),
    ])
  },
})

const MarkstreamApp = defineComponent({
  setup() {
    const content = ref('')
    installBenchmark(() => content.value, (value) => {
      content.value = value
    })
    onMounted(() => {
      window.__ready = true
    })
    return () => h('main', { class: 'bench-shell' }, [
      h('section', { class: 'bench-host vue-host' }, [
        h(MarkdownRender, {
          content: content.value,
          mode: 'chat',
          final: false,
          maxLiveNodes: variant === 'window' ? 64 : 0,
          batchRendering: true,
          renderBatchSize: 16,
          smoothStreaming: variant === 'incremental-nosmooth' || variant === 'window' ? false : 'auto',
          parseCoalesceMs: 32,
          renderCodeBlocksAsPre: true,
        }),
      ]),
    ])
  },
})

createApp(renderer === 'streamdown' ? StreamdownApp : MarkstreamApp).mount('#app')
