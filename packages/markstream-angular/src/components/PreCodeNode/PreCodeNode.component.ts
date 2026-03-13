import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import type { AngularRenderableNode } from '../shared/node-helpers'
import { getString, normalizeCodeLanguage } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-pre-code-node',
  standalone: true,
  template: `
    <pre
      [class]="languageClass"
      [attr.aria-busy]="loading"
      [attr.aria-label]="ariaLabel"
      [attr.data-language]="language"
      tabindex="0"
    >
      <code translate="no">{{ code }}</code>
    </pre>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreCodeNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode

  get language() {
    return normalizeCodeLanguage((this.node as any)?.language)
  }

  get languageClass() {
    return `language-${this.language}`
  }

  get ariaLabel() {
    return this.language ? `Code block: ${this.language}` : 'Code block'
  }

  get code() {
    return getString((this.node as any)?.code)
  }

  get loading() {
    return (this.node as any)?.loading === true
  }
}
