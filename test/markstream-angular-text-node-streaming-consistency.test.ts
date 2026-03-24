import { describe, expect, it } from 'vitest'
import { TextNodeComponent } from '../packages/markstream-angular/src/components/TextNode/TextNode.component'
import '../node_modules/.pnpm/node_modules/@angular/compiler'

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
})
