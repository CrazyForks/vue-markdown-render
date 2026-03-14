import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import type { AngularRenderableNode } from '../shared/node-helpers'
import { getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-text-node',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ng-container *ngIf="!centered; else centeredText">{{ text }}</ng-container>
    <ng-template #centeredText>
      <span class="markstream-angular-text--centered">{{ text }}</span>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode

  get text() {
    return getString((this.node as any)?.content)
  }

  get centered() {
    return !!(this.node as any)?.center
  }
}
