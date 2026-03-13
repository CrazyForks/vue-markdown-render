import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import type { AngularRenderableNode } from '../shared/node-helpers'
import { getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-math-block-node',
  standalone: true,
  template: `
    <pre class="markstream-nested-math-block">
      <code>{{ content }}</code>
    </pre>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MathBlockNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode

  get content() {
    return getString((this.node as any)?.content || (this.node as any)?.markup || (this.node as any)?.raw)
  }
}
