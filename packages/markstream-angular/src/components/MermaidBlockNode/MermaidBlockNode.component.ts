import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import type { AngularRenderableNode } from '../shared/node-helpers'
import { getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-mermaid-block-node',
  standalone: true,
  template: `
    <pre data-markstream-code-block="1" data-markstream-language="mermaid">
      <code class="language-mermaid" translate="no">{{ code }}</code>
    </pre>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MermaidBlockNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode

  get code() {
    return getString((this.node as any)?.code)
  }
}
