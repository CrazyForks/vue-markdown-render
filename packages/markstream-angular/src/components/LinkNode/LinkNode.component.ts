import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, Input, forwardRef } from '@angular/core'
import { NestedRendererComponent } from '../NestedRenderer/NestedRenderer.component'
import type { AngularRenderContext, AngularRenderableNode } from '../shared/node-helpers'
import { getNodeList, getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-link-node',
  standalone: true,
  imports: [CommonModule, forwardRef(() => NestedRendererComponent)],
  template: `
    <a
      [attr.href]="href || null"
      [attr.title]="tooltipLabel || null"
      target="_blank"
      rel="noreferrer noopener"
    >
      <markstream-angular-nested-renderer
        *ngIf="hasChildren; else fallbackText"
        [nodes]="children"
        [context]="context"
        [indexPrefix]="nestedPrefix"
      />
      <ng-template #fallbackText>{{ fallbackLabel }}</ng-template>
    </a>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinkNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode
  @Input() context?: AngularRenderContext
  @Input() indexKey?: string

  get href() {
    return getString((this.node as any)?.href)
  }

  get title() {
    return getString((this.node as any)?.title)
  }

  get tooltipLabel() {
    if (this.context?.showTooltips === false)
      return ''
    return this.title || this.href
  }

  get children() {
    return getNodeList((this.node as any)?.children)
  }

  get hasChildren() {
    return this.children.length > 0
  }

  get fallbackLabel() {
    return getString((this.node as any)?.text || this.href)
  }

  get nestedPrefix() {
    return `${this.indexKey || 'link'}-inline`
  }
}
