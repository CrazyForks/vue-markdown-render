import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import type { AngularRenderableNode } from '../shared/node-helpers'
import { getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-math-inline-node',
  standalone: true,
  template: `
    <span class="markstream-nested-math" data-display="inline">
      {{ content }}
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MathInlineNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode

  get content() {
    return getString((this.node as any)?.content || (this.node as any)?.markup || (this.node as any)?.raw)
  }
}
