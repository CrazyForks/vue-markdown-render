import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, Input, forwardRef } from '@angular/core'
import { NestedRendererComponent } from '../NestedRenderer/NestedRenderer.component'
import type { AngularRenderContext, AngularRenderableNode } from '../shared/node-helpers'
import { getNodeList } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-highlight-node',
  standalone: true,
  imports: [CommonModule, forwardRef(() => NestedRendererComponent)],
  template: `
    <mark>
      <markstream-angular-nested-renderer
        [nodes]="children"
        [context]="context"
        [indexPrefix]="nestedPrefix"
      />
    </mark>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HighlightNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode
  @Input() context?: AngularRenderContext
  @Input() indexKey?: string

  get children() {
    return getNodeList((this.node as any)?.children)
  }

  get nestedPrefix() {
    return `${this.indexKey || 'highlight'}-highlight`
  }
}
