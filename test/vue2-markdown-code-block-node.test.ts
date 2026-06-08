import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('markstream-vue2 MarkdownCodeBlockNode', () => {
  it('watches isDark when updating the Shiki renderer theme', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'packages/markstream-vue2/src/components/MarkdownCodeBlockNode/MarkdownCodeBlockNode.vue'),
      'utf8',
    )

    expect(source).toMatch(/\(\) => \[props\.darkTheme, props\.lightTheme, props\.isDark\]/)
  })
})
