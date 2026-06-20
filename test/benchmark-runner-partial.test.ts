import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function writeChildProcessHook(hookPath: string) {
  writeFileSync(hookPath, `
const { writeFileSync } = require('node:fs')

const script = (process.argv[1] || '').replace(/\\\\/g, '/')
if (script.includes('/scripts/e2e-')) {
  const resultPath = process.env.WEB_VITALS_JSON_PATH || process.env.BENCHMARK_JSON_PATH

  if (process.env.PLAYGROUND_SAMPLE === 'truncated') {
    writeFileSync(resultPath, '{"truncated":')
    console.error('synthetic child failure')
    process.exit(7)
  }

  let result
  if (script.includes('e2e-main-playground-performance')) {
    result = { initial: {}, fullScroll: {}, replay: {} }
  }
  else if (script.includes('e2e-web-vitals-performance')) {
    result = {
      environment: {},
      millionRestore: { restore: {}, scroll: {} },
      codeblockMonaco: { initial: {}, scroll: {} },
      warnings: [],
    }
  }
  else {
    result = { markdown: {}, monaco: {} }
  }

  writeFileSync(resultPath, JSON.stringify(result))
  process.exit(0)
}
`)
}

describe('benchmark 1.0 runner partial reports', () => {
  it('keeps later scenario results when a failed child writes truncated JSON', () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'markstream-benchmark-runner-'))
    try {
      const hookPath = join(tmpRoot, 'benchmark-child-hook.cjs')
      const outputDir = join(tmpRoot, 'benchmark')
      writeChildProcessHook(hookPath)

      const run = spawnSync(process.execPath, ['scripts/benchmark-1-0.mjs'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_SHA: 'benchmark-test-sha',
          MARKSTREAM_BENCHMARK_OUTPUT_DIR: outputDir,
          MARKSTREAM_BENCHMARK_SAMPLES: 'truncated,ok',
          MARKSTREAM_BENCHMARK_SKIP_BUILD: '1',
          NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${hookPath}`].filter(Boolean).join(' '),
          PLAYWRIGHT_CHROME_PATH: join(tmpRoot, 'missing-chrome'),
        },
      })

      expect(run.status).toBe(1)

      const partialJson = readdirSync(outputDir).find(file => file.endsWith('.partial.json'))
      expect(partialJson).toBeTruthy()
      const report = JSON.parse(readFileSync(join(outputDir, partialJson!), 'utf8'))

      expect(report.scenarios.map((scenario: any) => scenario.id)).toEqual([
        'diagnostic-truncated',
        'diagnostic-ok',
        'main-playground-chat',
        'web-vitals-performance',
      ])
      expect(report.scenarios[0].status).toBe('failed')
      expect(report.scenarios[0].error).toContain('synthetic child failure')
      expect(report.scenarios[0].resultReadError).toMatch(/JSON|Unexpected|unterminated/i)
      expect(report.scenarios.slice(1).every((scenario: any) => scenario.status === 'passed')).toBe(true)

      const summary = readFileSync(join(outputDir, 'latest-partial-summary.md'), 'utf8')
      expect(summary).toContain('### Diagnostic Studio / truncated')
      expect(summary).toContain('Result JSON read error:')
      expect(summary).toContain('Diagnostic Studio / ok')
      expect(summary).toContain('Web Vitals / restore and scroll')
    }
    finally {
      rmSync(tmpRoot, { recursive: true, force: true })
    }
  })
})
