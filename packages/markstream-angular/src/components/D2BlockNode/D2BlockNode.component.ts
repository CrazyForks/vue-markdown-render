import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import type { AngularRenderableNode } from '../shared/node-helpers'
import { getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-d2-block-node',
  standalone: true,
  template: `
    <pre data-markstream-code-block="1" data-markstream-language="d2">
      <code class="language-d2" translate="no">{{ code }}</code>
    </pre>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class D2BlockNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode

  get code() {
    return getString((this.node as any)?.code)
  }
}
