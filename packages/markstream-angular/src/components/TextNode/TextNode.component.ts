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

function settleAndMergeSegments(segments: StreamSegment[], segmentId?: number) {
  return segments.reduce<StreamSegment[]>((result, segment) => {
    const nextSegment = segmentId == null || segment.id === segmentId
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
  selector: 'markstream-angular-text-node',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ng-container *ngIf="!centered; else centeredText">
      <span class="markstream-angular-text-node">
        <span
          *ngFor="let segment of segments; trackBy: trackSegment"
          [class]="segment.fading ? 'markstream-angular-text__stream-delta ' + streamedDeltaClass(segment) : ''"
          (animationend)="segment.fading && settleSegment(segment.id)"
        >{{ segment.content }}</span>
      </span>
    </ng-container>
    <ng-template #centeredText>
      <span class="markstream-angular-text-node markstream-angular-text--centered">
        <span
          *ngFor="let segment of segments; trackBy: trackSegment"
          [class]="segment.fading ? 'markstream-angular-text__stream-delta ' + streamedDeltaClass(segment) : ''"
          (animationend)="segment.fading && settleSegment(segment.id)"
        >{{ segment.content }}</span>
      </span>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextNodeComponent implements OnChanges {
  @Input({ required: true }) node!: AngularRenderableNode
  @Input() context?: AngularRenderContext
  @Input() indexKey?: string
  @Input() typewriter?: boolean
  @Input() fade?: boolean

  segments: StreamSegment[] = []
  private renderedText = ''
  private nextSegmentId = 0
  private lastStreamRenderVersion?: number

  ngOnChanges() {
    const nextText = getString((this.node as any)?.content)
    const streamStateKey = getString(this.indexKey).trim()
    const textStreamState = this.context?.textStreamState
    const streamRenderVersion = this.context?.streamRenderVersion
    const streamRenderVersionChanged = streamRenderVersion !== this.lastStreamRenderVersion
    const previousPersisted = streamStateKey
      ? textStreamState?.get(streamStateKey)
      : undefined
    const previousText = previousPersisted ?? this.renderedText
    const resumeFromPersistedText = previousPersisted !== undefined
      && previousPersisted !== this.renderedText

    if (!this.fadeEnabled) {
      this.setFullText(nextText)
      this.renderedText = nextText
      if (streamStateKey)
        textStreamState?.set(streamStateKey, nextText)
      this.lastStreamRenderVersion = streamRenderVersion
      return
    }

    if (nextText === previousText) {
      if (this.segments.some(segment => segment.fading) && streamRenderVersionChanged) {
        this.settleFadingSegments()
      }
      else if (this.renderedText !== nextText) {
        this.setFullText(nextText)
      }
      this.renderedText = nextText
      if (streamStateKey)
        textStreamState?.set(streamStateKey, nextText)
      this.lastStreamRenderVersion = streamRenderVersion
      return
    }

    if (previousText && nextText.startsWith(previousText)) {
      const appendedText = nextText.slice(previousText.length)
      const lastSegment = this.segments[this.segments.length - 1]
      if (resumeFromPersistedText) {
        this.segments = [
          { id: this.nextSegmentId++, content: previousText, fading: false },
          { id: this.nextSegmentId++, content: appendedText, fading: true },
        ]
      }
      else if (lastSegment?.fading) {
        this.segments = [
          ...this.segments.slice(0, -1),
          { ...lastSegment, content: lastSegment.content + appendedText },
        ]
      }
      else {
        this.segments = [
          ...this.segments,
          { id: this.nextSegmentId++, content: appendedText, fading: true },
        ]
      }
    }
    else {
      this.setFullText(nextText)
    }

    this.renderedText = nextText
    if (streamStateKey)
      textStreamState?.set(streamStateKey, nextText)
    this.lastStreamRenderVersion = streamRenderVersion
  }

  get centered() {
    return !!(this.node as any)?.center
  }

  get settledText() {
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

  private setFullText(content: string) {
    if (this.segments.length === 1 && !this.segments[0]?.fading && this.segments[0].content === content)
      return
    this.segments = content
      ? [{ id: this.nextSegmentId++, content, fading: false }]
      : []
  }

  private settleFadingSegments() {
    this.segments = settleAndMergeSegments(this.segments)
  }
}
