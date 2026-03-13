import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import type { AngularRenderableNode } from '../shared/node-helpers'
import {
  encodeDataPayload,
  getString,
  normalizeCodeLanguage,
} from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-code-block-node',
  standalone: true,
  template: `
    <pre
      data-markstream-code-block="1"
      [attr.data-markstream-language]="rawLanguage || null"
      [attr.data-markstream-diff]="isDiff ? '1' : null"
      [attr.data-markstream-original]="isDiff ? originalPayload : null"
      [attr.data-markstream-updated]="isDiff ? updatedPayload : null"
    >
      <code [class]="languageClass" translate="no">{{ code }}</code>
    </pre>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeBlockNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode

  get rawLanguage() {
    return getString((this.node as any)?.language).trim()
  }

  get language() {
    return normalizeCodeLanguage(this.rawLanguage)
  }

  get languageClass() {
    return `language-${this.language}`
  }

  get code() {
    return getString((this.node as any)?.code)
  }

  get isDiff() {
    return !!(this.node as any)?.diff
  }

  get originalPayload() {
    return encodeDataPayload(getString((this.node as any)?.originalCode))
  }

  get updatedPayload() {
    return encodeDataPayload(getString((this.node as any)?.updatedCode))
  }
}
