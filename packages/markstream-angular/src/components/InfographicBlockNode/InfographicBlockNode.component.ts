import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import type { AngularRenderableNode } from '../shared/node-helpers'
import { getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-infographic-block-node',
  standalone: true,
  template: `
    <pre data-markstream-code-block="1" data-markstream-language="infographic">
      <code class="language-infographic" translate="no">{{ code }}</code>
    </pre>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InfographicBlockNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode

  get code() {
    return getString((this.node as any)?.code)
  }
}
