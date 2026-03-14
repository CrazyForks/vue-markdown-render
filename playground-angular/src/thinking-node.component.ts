import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { NestedRenderer, type AngularRenderContext } from 'markstream-angular'

@Component({
  selector: 'app-angular-thinking-node',
  standalone: true,
  imports: [CommonModule, NestedRenderer],
  template: `
    <div class="thinking-node">
      <div class="thinking-node__icon-shell" aria-hidden="true">
        <div class="thinking-node__icon">
          <svg class="thinking-node__icon-svg" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3C7.03 3 3 6.58 3 11c0 1.86.66 3.57 1.77 4.98L4 21l5.2-1.9C10.06 19.35 11 19.5 12 19.5c4.97 0 9-3.58 9-8.5S16.97 3 12 3z"
              stroke="currentColor"
              stroke-width="0.8"
              fill="currentColor"
              opacity="0.9"
            />
          </svg>
        </div>
      </div>

      <div class="thinking-node__body">
        <div class="thinking-node__meta">
          <strong>Thinking</strong>
          <span class="thinking-node__role">(assistant)</span>
          <span class="thinking-dots" [class.visible]="node?.loading" [class.hidden]="!node?.loading" aria-hidden="true">
            <span class="dot dot-1"></span>
            <span class="dot dot-2"></span>
            <span class="dot dot-3"></span>
          </span>
        </div>

        <div class="thinking-node__content">
          <span *ngIf="node?.loading" class="thinking-node__sr-only" aria-live="polite">Thinking...</span>
          <markstream-angular-nested-renderer
            [content]="resolvedContent"
            [final]="resolvedFinal"
            [customHtmlTags]="resolvedCustomHtmlTags"
            [parseOptions]="context?.parseOptions"
            [customMarkdownIt]="context?.customMarkdownIt"
            [context]="context"
            [indexPrefix]="nestedPrefix"
          />
        </div>
      </div>
    </div>
  `,
  styles: [`
    .thinking-node {
      margin: 1rem 0;
      display: flex;
      gap: 0.75rem;
      border-left: 4px solid #60a5fa;
      border-radius: 0.75rem;
      background: #eff6ff;
      padding: 1rem;
      color: #0f172a;
    }

    :host-context(.dark) .thinking-node {
      background: rgba(30, 64, 175, 0.2);
      color: #e6f0ff;
    }

    .thinking-node__icon-shell {
      flex-shrink: 0;
      margin-top: 0.25rem;
    }

    .thinking-node__icon {
      display: flex;
      height: 2.25rem;
      width: 2.25rem;
      align-items: center;
      justify-content: center;
      border-radius: 9999px;
      background: #bfdbfe;
      color: #1d4ed8;
    }

    :host-context(.dark) .thinking-node__icon {
      background: #1d4ed8;
      color: #dbeafe;
    }

    .thinking-node__icon-svg {
      height: 1.25rem;
      width: 1.25rem;
    }

    .thinking-node__body {
      min-width: 0;
      flex: 1;
    }

    .thinking-node__meta {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
      font-size: 0.875rem;
    }

    .thinking-node__role {
      font-size: 0.75rem;
      color: #64748b;
    }

    :host-context(.dark) .thinking-node__role {
      color: #cbd5e1;
    }

    .thinking-node__content {
      margin-top: 0.25rem;
      min-height: 1.25rem;
      font-size: 0.875rem;
      line-height: 1.65;
    }

    .thinking-dots {
      display: inline-flex;
      height: 12px;
      width: 36px;
      align-items: center;
      justify-content: flex-start;
      gap: 6px;
      opacity: 0;
      transition: opacity 160ms linear, transform 160ms linear;
    }

    .thinking-dots .dot {
      height: 6px;
      width: 6px;
      transform: translateY(0);
      border-radius: 9999px;
      background: #1e3a8a;
      opacity: 0.25;
    }

    :host-context(.dark) .thinking-dots .dot {
      background: #bfdbfe;
      opacity: 0.28;
    }

    .thinking-dots.visible {
      opacity: 1;
    }

    .thinking-dots.hidden {
      opacity: 0;
      transform: translateY(0);
    }

    .thinking-dots.visible .dot-1 {
      animation: think-bounce 1s infinite ease-in-out;
      animation-delay: 0s;
    }

    .thinking-dots.visible .dot-2 {
      animation: think-bounce 1s infinite ease-in-out;
      animation-delay: 0.12s;
    }

    .thinking-dots.visible .dot-3 {
      animation: think-bounce 1s infinite ease-in-out;
      animation-delay: 0.24s;
    }

    .thinking-node__sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    @keyframes think-bounce {
      0%, 80%, 100% {
        transform: translateY(0);
        opacity: 0.25;
      }

      40% {
        transform: translateY(-6px);
        opacity: 1;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThinkingNodeComponent {
  @Input({ required: true }) node!: Record<string, any>
  @Input() context?: AngularRenderContext
  @Input() indexKey?: string

  private readonly fallbackThinkingTags = ['thinking']

  get resolvedFinal() {
    if (typeof this.node?.loading === 'boolean')
      return !this.node.loading
    return this.context?.final
  }

  get resolvedCustomHtmlTags() {
    return this.context?.customHtmlTags?.length
      ? this.context.customHtmlTags
      : this.fallbackThinkingTags
  }

  get nestedPrefix() {
    return this.indexKey ? `${this.indexKey}-thinking` : 'thinking'
  }

  get resolvedContent() {
    return typeof this.node?.content === 'string' ? this.node.content : ''
  }
}
