import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, Input, OnChanges, forwardRef } from '@angular/core'
import { NestedRendererComponent } from '../NestedRenderer/NestedRenderer.component'
import { NodeOutletComponent } from '../NodeOutlet/NodeOutlet.component'
import type { AngularRenderContext, AngularRenderableNode } from '../shared/node-helpers'
import { getNodeList, splitParagraphChildren } from '../shared/node-helpers'

type ParagraphSegment
  = | { kind: 'inline', nodes: AngularRenderableNode[] }
    | { kind: 'block', node: AngularRenderableNode }

@Component({
  selector: 'markstream-angular-paragraph-node',
  standalone: true,
  imports: [
    CommonModule,
    forwardRef(() => NestedRendererComponent),
    forwardRef(() => NodeOutletComponent),
  ],
  template: `
    <ng-container *ngIf="segments.length > 0; else simpleParagraph">
      <ng-container *ngFor="let segment of segments; let idx = index; trackBy: trackByIndex">
        <p *ngIf="segment.kind === 'inline'; else blockSegment" dir="auto" class="paragraph-node">
          <markstream-angular-nested-renderer
            [nodes]="segment.nodes"
            [context]="context"
            [indexPrefix]="segmentPrefix(idx)"
          />
        </p>

        <ng-template #blockSegment>
          <markstream-angular-node-outlet
            [node]="$any(segment).node"
            [context]="context"
            [indexKey]="segmentPrefix(idx)"
          />
        </ng-template>
      </ng-container>
    </ng-container>

    <ng-template #simpleParagraph>
      <p dir="auto" class="paragraph-node">
        <markstream-angular-nested-renderer
          [nodes]="children"
          [context]="context"
          [indexPrefix]="indexKey || 'paragraph'"
        />
      </p>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParagraphNodeComponent implements OnChanges {
  @Input({ required: true }) node!: AngularRenderableNode
  @Input() context?: AngularRenderContext
  @Input() indexKey?: string

  segments: ParagraphSegment[] = []

  get children() {
    return getNodeList((this.node as any)?.children)
  }

  ngOnChanges() {
    this.segments = splitParagraphChildren(this.children)
  }

  trackByIndex = (index: number) => {
    return `${this.indexKey || 'paragraph'}-${index}`
  }

  segmentPrefix(index: number) {
    return `${this.indexKey || 'paragraph'}-${index}`
  }
}
