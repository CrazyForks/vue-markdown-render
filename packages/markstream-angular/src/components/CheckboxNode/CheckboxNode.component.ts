import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import type { AngularRenderableNode } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-checkbox-node',
  standalone: true,
  template: '<input type="checkbox" disabled [checked]="checked">',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckboxNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode

  get checked() {
    return !!(this.node as any)?.checked
  }
}
