import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const angularCompilerEntry = require.resolve('@angular/compiler', {
  paths: [resolve(process.cwd(), 'node_modules/.pnpm/node_modules')],
})
await import(angularCompilerEntry)
const { TextNodeComponent } = await import('../packages/markstream-angular/src/components/TextNode/TextNode.component')
const { InlineCodeNodeComponent } = await import('../packages/markstream-angular/src/components/InlineCodeNode/InlineCodeNode.component')

describe('markstream-angular text node streaming consistency', () => {
  it('settles a finished text delta when a later stream tick keeps the same text', () => {
    const textStreamState = new Map<string, string>()
    const component = new TextNodeComponent()

    component.indexKey = 'stream-0'
    component.context = {
      events: {},
      textStreamState,
      typewriter: true,
      streamRenderVersion: 1,
    }
    component.node = {
      type: 'text',
      content: '记忆化递归（动态规划）',
      raw: '记忆化递归（动态规划）',
    } as any

    textStreamState.set('stream-0', '记忆化递归（动态规划')
    component.ngOnChanges()

    expect(component.settledText).toBe('记忆化递归（动态规划')
    expect(component.streamedDelta).toBe('）')

    component.context = {
      ...component.context,
      streamRenderVersion: 2,
    }
    component.ngOnChanges()

    expect(component.settledText).toBe('记忆化递归（动态规划）')
    expect(component.streamedDelta).toBe('')
  })

  it('keeps active text and inline-code fade segment ids stable during rapid updates', () => {
    const textComponent = new TextNodeComponent()
    textComponent.context = { events: {}, fade: true, streamRenderVersion: 1 }
    textComponent.node = { type: 'text', content: 'Hello', raw: 'Hello' } as any
    textComponent.ngOnChanges()

    textComponent.context = { ...textComponent.context, streamRenderVersion: 2 }
    textComponent.node = { type: 'text', content: 'HelloWorld', raw: 'HelloWorld' } as any
    textComponent.ngOnChanges()
    const textDelta = textComponent.segments.find(segment => segment.fading)!
    const textDeltaClass = textComponent.streamedDeltaClass(textDelta)

    textComponent.context = { ...textComponent.context, streamRenderVersion: 3 }
    textComponent.node = { type: 'text', content: 'HelloWorldAgain', raw: 'HelloWorldAgain' } as any
    textComponent.ngOnChanges()
    const updatedTextDelta = textComponent.segments.find(segment => segment.fading)!

    expect(updatedTextDelta.id).toBe(textDelta.id)
    expect(textComponent.streamedDeltaClass(updatedTextDelta)).toBe(textDeltaClass)
    expect(updatedTextDelta.content).toBe('WorldAgain')
    expect(textComponent.settledText).toBe('Hello')

    textComponent.settleSegment(updatedTextDelta.id)
    expect(textComponent.segments).toHaveLength(1)
    expect(textComponent.segments[0]?.content).toBe('HelloWorldAgain')

    textComponent.context = { ...textComponent.context, streamRenderVersion: 4 }
    textComponent.node = { type: 'text', content: 'HelloWorldAgainNext', raw: 'HelloWorldAgainNext' } as any
    textComponent.ngOnChanges()
    expect(textComponent.segments).toHaveLength(2)
    expect(textComponent.streamedDelta).toBe('Next')

    const codeComponent = new InlineCodeNodeComponent()
    codeComponent.context = { events: {}, fade: true }
    codeComponent.node = { type: 'inline_code', code: 'foo', raw: '`foo`' } as any
    codeComponent.ngOnChanges()
    codeComponent.node = { type: 'inline_code', code: 'foobar', raw: '`foobar`' } as any
    codeComponent.ngOnChanges()
    const codeDelta = codeComponent.segments.find(segment => segment.fading)!
    const codeDeltaClass = codeComponent.streamedDeltaClass(codeDelta)

    codeComponent.node = { type: 'inline_code', code: 'foobarbaz', raw: '`foobarbaz`' } as any
    codeComponent.ngOnChanges()
    const updatedCodeDelta = codeComponent.segments.find(segment => segment.fading)!

    expect(updatedCodeDelta.id).toBe(codeDelta.id)
    expect(codeComponent.streamedDeltaClass(updatedCodeDelta)).toBe(codeDeltaClass)
    expect(updatedCodeDelta.content).toBe('barbaz')
    expect(codeComponent.settledCode).toBe('foo')

    codeComponent.settleSegment(updatedCodeDelta.id)
    expect(codeComponent.segments).toHaveLength(1)
    expect(codeComponent.segments[0]?.content).toBe('foobarbaz')
  })

  it('ships pre-wrap text styles so softbreaks stay visible in Angular', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'packages/markstream-angular/src/index.css'),
      'utf8',
    )

    expect(css).toContain('.markstream-angular .markstream-angular-text-node')
    expect(css).toContain('white-space: pre-wrap;')
  })
})
