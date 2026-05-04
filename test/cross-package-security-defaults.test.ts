import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('cross-package security defaults', () => {
  it('keeps Mermaid strict by default across framework packages', () => {
    expect(source('packages/markstream-vue2/src/components/MermaidBlockNode/MermaidBlockNode.vue')).toContain('isStrict: true')
    expect(source('packages/markstream-react/src/components/MermaidBlockNode/MermaidBlockNode.tsx')).toContain('isStrict: true')
    expect(source('packages/markstream-angular/src/components/MermaidBlockNode/MermaidBlockNode.component.ts')).toContain('this.mergedProps.isStrict !== false')

    for (const path of [
      'packages/markstream-vue2/src/workers/mermaidParser.worker.ts',
      'packages/markstream-react/src/workers/mermaidParser.worker.ts',
      'packages/markstream-angular/src/workers/mermaidParser.worker.ts',
      'packages/markstream-vue2/src/workers/mermaidCdnWorker.ts',
      'packages/markstream-angular/src/workers/mermaidCdnWorker.ts',
    ]) {
      const workerSource = source(path)
      expect(workerSource).toContain('securityLevel: \'strict\'')
      expect(workerSource).toContain('htmlLabels: false')
    }
  })
})
