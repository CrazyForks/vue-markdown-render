import type { ComponentRef, Type } from '@angular/core'
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  ViewContainerRef,
} from '@angular/core'
import type { AngularRenderContext, AngularRenderableNode } from '../shared/node-helpers'

@Component({
  selector: 'markstream-angular-dynamic-node-host',
  standalone: true,
  template: '<ng-template #container></ng-template>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DynamicNodeHostComponent implements OnChanges, OnDestroy {
  @Input() component?: Type<any> | null
  @Input({ required: true }) node!: AngularRenderableNode
  @Input() context?: AngularRenderContext
  @Input() indexKey?: string

  @ViewChild('container', { read: ViewContainerRef, static: true })
  private containerRef?: ViewContainerRef

  private componentRef: ComponentRef<any> | null = null

  ngOnChanges(changes: SimpleChanges) {
    if (!this.containerRef)
      return

    if (changes['component'])
      this.mountComponent()

    this.applyInputs()
  }

  ngOnDestroy() {
    this.componentRef?.destroy()
    this.componentRef = null
  }

  private mountComponent() {
    this.containerRef?.clear()
    this.componentRef?.destroy()
    this.componentRef = null

    if (!this.component || !this.containerRef)
      return

    this.componentRef = this.containerRef.createComponent(this.component)
  }

  private applyInputs() {
    const instance = this.componentRef?.instance
    if (!instance)
      return

    instance.node = this.node
    instance.context = this.context
    instance.ctx = this.context
    instance.customId = this.context?.customId
    instance.isDark = this.context?.isDark
    instance.indexKey = this.indexKey
    instance.typewriter = this.context?.typewriter
    instance.showTooltips = this.context?.showTooltips

    this.componentRef?.changeDetectorRef.detectChanges()
  }
}
