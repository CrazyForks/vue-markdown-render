import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import type { AngularRenderableNode } from '../shared/node-helpers'
import { getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-image-node',
  standalone: true,
  template: `
    <img
      [attr.src]="src"
      [attr.alt]="alt"
      [attr.title]="title || null"
    >
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode

  get src() {
    return getString((this.node as any)?.src)
  }

  get alt() {
    return getString((this.node as any)?.alt)
  }

  get title() {
    return getString((this.node as any)?.title)
  }
}
