import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import type { AngularRenderableNode } from '../shared/node-helpers'
import { getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-inline-code-node',
  standalone: true,
  template: '<code>{{ code }}</code>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InlineCodeNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode

  get code() {
    return getString((this.node as any)?.code)
  }
}
