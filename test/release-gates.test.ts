import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('release dependency gates', () => {
  const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))

  it('runs the workspace dependency publish gate before packed smoke on prepublish', () => {
    const scripts = packageJson.scripts
    const prepublishOnly = scripts.prepublishOnly

    expect(scripts['check:workspace-deps-published']).toBe('node ./scripts/check-workspace-deps-published.mjs')
    expect(prepublishOnly).toContain('pnpm run build:parser')
    expect(prepublishOnly).toContain('pnpm run check:workspace-deps-published')
    expect(prepublishOnly).toContain('pnpm run test:smoke:pack')
    expect(prepublishOnly).toContain('pnpm run test:smoke:pack:optional')
    expect(prepublishOnly.indexOf('pnpm run build:parser')).toBeLessThan(prepublishOnly.indexOf('pnpm run check:workspace-deps-published'))
    expect(prepublishOnly.indexOf('pnpm run check:workspace-deps-published')).toBeLessThan(prepublishOnly.indexOf('pnpm run test:smoke:pack'))
    expect(prepublishOnly.indexOf('pnpm run test:smoke:pack')).toBeLessThan(prepublishOnly.indexOf('pnpm run test:smoke:pack:optional'))
  })

  it('uses the workspace dependency publish gate in the release script', () => {
    const release = packageJson.scripts.release

    expect(release).toContain('pnpm run check:workspace-deps-published')
    expect(release).not.toContain('pnpm run check:core-published')
  })

  it('uses the 1.0 release gate before publishing stable packages', () => {
    const scripts = packageJson.scripts
    const releaseGate = scripts['release:gate:1.0']
    const release1 = scripts['release:1.0']

    expect(releaseGate).toContain('pnpm run release:verify')
    expect(releaseGate).toContain('pnpm run docs:build:ci')
    expect(releaseGate).toContain('pnpm run size:check')
    expect(releaseGate).toContain('pnpm run benchmark:1.0')
    expect(release1).toContain('pnpm run release:gate:1.0')
    expect(scripts['publish:parser:current']).toContain('scripts/publish-current-package.mjs')
    expect(scripts['publish:core:current']).toContain('scripts/publish-current-package.mjs')
    expect(scripts['publish:vue3:current']).toContain('scripts/publish-current-package.mjs')
    expect(release1).not.toContain('pnpm run release:parser')
    expect(release1).not.toContain('pnpm run release:core')
    expect(release1).not.toMatch(/&& pnpm run release(?:\s|$)/)
    expect(release1.indexOf('pnpm run release:gate:1.0')).toBeLessThan(release1.indexOf('pnpm run publish:parser:current'))
    expect(release1.indexOf('pnpm run publish:parser:current')).toBeLessThan(release1.indexOf('pnpm run publish:core:current'))
    expect(release1.indexOf('pnpm run publish:core:current')).toBeLessThan(release1.indexOf('pnpm run publish:vue3:current'))
  })

  it('checks both runtime workspace packages for published versions', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/check-workspace-deps-published.mjs'), 'utf8')

    expect(script).toMatch(/name: 'markstream-core'/)
    expect(script).toMatch(/packageJson: 'packages\/markstream-core\/package\.json'/)
    expect(script).toMatch(/name: 'stream-markdown-parser'/)
    expect(script).toMatch(/packageJson: 'packages\/markdown-parser\/package\.json'/)
  })
})
