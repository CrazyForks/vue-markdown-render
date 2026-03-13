import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import type { AngularRenderContext, AngularRenderableNode } from '../shared/node-helpers'
import { escapeHtml, getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-html-inline-node',
  standalone: true,
  template: '<span class="html-inline-node" [innerHTML]="htmlContent"></span>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HtmlInlineNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode
  @Input() context?: AngularRenderContext

  get htmlContent() {
    const content = getString((this.node as any)?.content)
    if (!content)
      return ''
    if (this.context?.allowHtml === false)
      return escapeHtml(content)
    if ((this.node as any)?.loading && !(this.node as any)?.autoClosed)
      return escapeHtml(content)
    return content
  }
}
