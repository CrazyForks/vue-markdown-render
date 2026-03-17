import type { AngularRenderableNode } from '../shared/node-helpers'
import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-reference-node',
  standalone: true,
  template: '<sup class="markstream-nested-reference">[{{ id }}]</sup>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReferenceNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode

  get id() {
    return getString((this.node as any)?.id)
  }
}
