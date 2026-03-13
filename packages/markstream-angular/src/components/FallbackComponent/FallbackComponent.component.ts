import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, Input, forwardRef } from '@angular/core'
import { renderNestedMarkdownToHtml } from '../../renderMarkdownHtml'
import { NestedRendererComponent } from '../NestedRenderer/NestedRenderer.component'
import type { AngularRenderContext, AngularRenderableNode } from '../shared/node-helpers'
import {
  escapeHtml,
  getNodeList,
  getString,
  sanitizeClassToken,
} from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-fallback-node',
  standalone: true,
  imports: [CommonModule, forwardRef(() => NestedRendererComponent)],
  template: `
    <div
      class="markstream-nested-custom"
      [class]="customClassName"
      [attr.data-markstream-custom-tag]="customTag"
    >
      <markstream-angular-nested-renderer
        *ngIf="hasChildren; else fallbackBody"
        [nodes]="children"
        [context]="context"
        [indexPrefix]="nestedPrefix"
      />

      <ng-template #fallbackBody>
        <div [innerHTML]="bodyHtml"></div>
      </ng-template>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FallbackComponent {
  @Input({ required: true }) node!: AngularRenderableNode
  @Input() context?: AngularRenderContext
  @Input() indexKey?: string

  get children() {
    return getNodeList((this.node as any)?.children)
  }

  get hasChildren() {
    return this.children.length > 0
  }

  get customTag() {
    return getString((this.node as any)?.tag || (this.node as any)?.type)
  }

  get customClassName() {
    const tag = sanitizeClassToken(this.customTag) || 'node'
    return `markstream-nested-custom--${tag}`
  }

  get bodyHtml() {
    const content = getString((this.node as any)?.content)
    if (content) {
      return renderNestedMarkdownToHtml(
        { content },
        {
          customHtmlTags: this.context?.customHtmlTags,
          allowHtml: this.context?.allowHtml !== false,
        },
      )
    }
    return escapeHtml(getString((this.node as any)?.raw))
  }

  get nestedPrefix() {
    return `${this.indexKey || 'fallback'}-children`
  }
}
