import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, Input, OnChanges, forwardRef } from '@angular/core'
import type { AngularRenderContext, AngularRenderableNode } from '../shared/node-helpers'
import { normalizeTokenAttrs } from '../shared/node-helpers'
import { SafeAttrsDirective } from '../shared/safe-attrs.directive'
import { NodeOutletComponent } from '../NodeOutlet/NodeOutlet.component'

type NestedRenderItem
  = | { kind: 'label', attrs: Record<string, string | true> | null, children: AngularRenderableNode[] }
    | { kind: 'node', node: AngularRenderableNode }

@Component({
  selector: 'markstream-angular-nested-renderer',
  standalone: true,
  imports: [
    CommonModule,
    SafeAttrsDirective,
    forwardRef(() => NestedRendererComponent),
    forwardRef(() => NodeOutletComponent),
  ],
  template: `
    <ng-container *ngFor="let item of items; let idx = index; trackBy: trackByIndex">
      <label *ngIf="item.kind === 'label'; else nodeTemplate" [markstreamSafeAttrs]="item.attrs">
        <markstream-angular-nested-renderer
          [nodes]="item.children"
          [context]="context"
          [indexPrefix]="childPrefix(idx)"
        />
      </label>

      <ng-template #nodeTemplate>
        <markstream-angular-node-outlet
          [node]="$any(item).node"
          [context]="context"
          [indexKey]="childPrefix(idx)"
        />
      </ng-template>
    </ng-container>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NestedRendererComponent implements OnChanges {
  @Input() nodes: readonly AngularRenderableNode[] | null | undefined
  @Input() context?: AngularRenderContext
  @Input() indexPrefix = 'nested'

  items: NestedRenderItem[] = []

  ngOnChanges() {
    this.items = this.buildItems(this.nodes)
  }

  trackByIndex = (index: number) => {
    return `${this.indexPrefix}-${index}`
  }

  childPrefix(index: number) {
    return `${this.indexPrefix}-${index}`
  }

  private buildItems(nodes: readonly AngularRenderableNode[] | null | undefined) {
    const source = Array.isArray(nodes) ? nodes : []
    const items: NestedRenderItem[] = []

    for (let index = 0; index < source.length; index += 1) {
      const node = source[index]
      if (!node)
        continue

      if (node.type === 'label_open') {
        const children: AngularRenderableNode[] = []
        let cursor = index + 1
        for (; cursor < source.length; cursor += 1) {
          const segment = source[cursor]
          if (segment?.type === 'label_close')
            break
          if (segment)
            children.push(segment)
        }

        items.push({
          kind: 'label',
          attrs: normalizeTokenAttrs((node as any)?.attrs),
          children,
        })
        index = cursor
        continue
      }

      if (node.type === 'label_close')
        continue

      items.push({ kind: 'node', node })
    }

    return items
  }
}
