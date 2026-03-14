import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, Input, forwardRef } from '@angular/core'
import { NestedRendererComponent } from '../NestedRenderer/NestedRenderer.component'
import type { AngularRenderContext, AngularRenderableNode } from '../shared/node-helpers'
import { getNodeList, getString } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-table-node',
  standalone: true,
  imports: [CommonModule, forwardRef(() => NestedRendererComponent)],
  template: `
    <table>
      <thead *ngIf="headerRow">
        <tr>
          <ng-container *ngFor="let cell of cellsFor(headerRow); let cellIndex = index; trackBy: trackCell">
            <th [style.text-align]="alignment(cell) || null">
              <markstream-angular-nested-renderer
                [nodes]="childrenFor(cell)"
                [context]="context"
                [indexPrefix]="cellPrefix('head', cellIndex)"
              />
            </th>
          </ng-container>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let row of rows; let rowIndex = index; trackBy: trackRow">
          <ng-container *ngFor="let cell of cellsFor(row); let cellIndex = index; trackBy: trackCell">
            <td [style.text-align]="alignment(cell) || null">
              <markstream-angular-nested-renderer
                [nodes]="childrenFor(cell)"
                [context]="context"
                [indexPrefix]="cellPrefix(rowIndex, cellIndex)"
              />
            </td>
          </ng-container>
        </tr>
      </tbody>
    </table>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableNodeComponent {
  @Input({ required: true }) node!: AngularRenderableNode
  @Input() context?: AngularRenderContext
  @Input() indexKey?: string

  get headerRow() {
    const row = (this.node as any)?.header
    return row && typeof row === 'object' ? row as AngularRenderableNode : null
  }

  get rows() {
    return getNodeList((this.node as any)?.rows)
  }

  cellsFor(row: AngularRenderableNode) {
    return getNodeList((row as any)?.cells)
  }

  childrenFor(cell: AngularRenderableNode) {
    return getNodeList((cell as any)?.children)
  }

  alignment(cell: AngularRenderableNode) {
    return getString((cell as any)?.align)
  }

  trackRow = (index: number) => {
    return `${this.indexKey || 'table'}-row-${index}`
  }

  trackCell = (index: number) => {
    return index
  }

  cellPrefix(rowIndex: string | number, cellIndex: number) {
    return `${this.indexKey || 'table'}-${rowIndex}-${cellIndex}`
  }
}
