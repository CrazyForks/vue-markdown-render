import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import type { AngularRenderableNode } from '../shared/node-helpers'
import { getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-image-node',
  standalone: true,
  template: `
    <figure class="image-node">
      <div class="image-node__inner">
        <img
          class="image-node__img"
          [class.image-node__img--svg]="isSvg"
          [attr.src]="src"
          [attr.alt]="alt"
          [attr.title]="title || null"
          [attr.loading]="'lazy'"
          decoding="async"
          [style.minHeight]="isSvg ? '12rem' : null"
          [style.width]="isSvg ? '100%' : null"
          [style.height]="isSvg ? 'auto' : null"
          [style.objectFit]="isSvg ? 'contain' : null"
        >
      </div>
    </figure>
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

  get isSvg() {
    return /\.svg(?:\?|$)/i.test(this.src)
  }
}
