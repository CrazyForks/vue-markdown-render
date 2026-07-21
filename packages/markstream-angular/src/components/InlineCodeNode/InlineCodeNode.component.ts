import type { OnChanges } from '@angular/core'
import type { AngularRenderableNode, AngularRenderContext } from '../shared/node-helpers'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { getString } from '../shared/node-helpers'

interface StreamSegment {
  id: number
  content: string
  fading: boolean
}

function settleAndMergeSegments(segments: StreamSegment[], segmentId: number) {
  return segments.reduce<StreamSegment[]>((result, segment) => {
    const nextSegment = segment.id === segmentId
      ? { ...segment, fading: false }
      : segment
    const previousSegment = result[result.length - 1]
    if (previousSegment && !previousSegment.fading && !nextSegment.fading) {
      result[result.length - 1] = {
        ...previousSegment,
        content: previousSegment.content + nextSegment.content,
      }
    }
    else {
      result.push(nextSegment)
    }
    return result
  }, [])
}

@Component({
  selector: 'markstream-angular-inline-code-node',
  standalone: true,
  imports: [CommonModule],
  template: `
    <code>
      <span
        *ngFor="let segment of segments; trackBy: trackSegment"
        [class]="segment.fading ? 'markstream-angular-text__stream-delta ' + streamedDeltaClass(segment) : ''"
        (animationend)="segment.fading && settleSegment(segment.id)"
      >{{ segment.content }}</span>
    </code>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InlineCodeNodeComponent implements OnChanges {
  @Input({ required: true }) node!: AngularRenderableNode
  @Input() context?: AngularRenderContext
  @Input() indexKey?: string
  @Input() typewriter?: boolean
  @Input() fade?: boolean

  segments: StreamSegment[] = []
  private renderedCode = ''
  private nextSegmentId = 0

  ngOnChanges() {
    const nextCode = getString((this.node as any)?.code)
    const streamStateKey = getString(this.indexKey).trim()
    const textStreamState = this.context?.textStreamState
    const previousPersisted = streamStateKey
      ? textStreamState?.get(streamStateKey)
      : undefined
    const previousCode = previousPersisted ?? this.renderedCode
    const resumeFromPersistedCode = previousPersisted !== undefined
      && previousPersisted !== this.renderedCode

    if (!this.fadeEnabled) {
      this.setFullCode(nextCode)
    }
    else if (nextCode !== previousCode) {
      if (previousCode && nextCode.startsWith(previousCode)) {
        const appendedCode = nextCode.slice(previousCode.length)
        const lastSegment = this.segments[this.segments.length - 1]
        if (resumeFromPersistedCode) {
          this.segments = [
            { id: this.nextSegmentId++, content: previousCode, fading: false },
            { id: this.nextSegmentId++, content: appendedCode, fading: true },
          ]
        }
        else if (lastSegment?.fading) {
          this.segments = [
            ...this.segments.slice(0, -1),
            { ...lastSegment, content: lastSegment.content + appendedCode },
          ]
        }
        else {
          this.segments = [
            ...this.segments,
            { id: this.nextSegmentId++, content: appendedCode, fading: true },
          ]
        }
      }
      else {
        this.setFullCode(nextCode)
      }
    }

    this.renderedCode = nextCode
    if (streamStateKey)
      textStreamState?.set(streamStateKey, nextCode)
  }

  get settledCode() {
    return this.segments.filter(segment => !segment.fading).map(segment => segment.content).join('')
  }

  get streamedDelta() {
    return this.segments.filter(segment => segment.fading).map(segment => segment.content).join('')
  }

  streamedDeltaClass(segment: StreamSegment) {
    return segment.id % 2 === 0
      ? 'markstream-angular-text__stream-delta--a'
      : 'markstream-angular-text__stream-delta--b'
  }

  get fadeEnabled() {
    if (typeof this.fade === 'boolean')
      return this.fade
    if (typeof this.context?.fade === 'boolean')
      return this.context.fade
    return true
  }

  get typewriterEnabled() {
    if (typeof this.typewriter === 'boolean')
      return this.typewriter
    if (typeof this.context?.typewriter === 'boolean')
      return this.context.typewriter
    return false
  }

  trackSegment(_index: number, segment: StreamSegment) {
    return segment.id
  }

  settleSegment(segmentId: number) {
    if (!this.segments.some(segment => segment.id === segmentId && segment.fading))
      return
    this.segments = settleAndMergeSegments(this.segments, segmentId)
  }

  private setFullCode(content: string) {
    if (this.segments.length === 1 && !this.segments[0]?.fading && this.segments[0].content === content)
      return
    this.segments = content
      ? [{ id: this.nextSegmentId++, content, fading: false }]
      : []
  }
}
