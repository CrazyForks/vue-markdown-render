import type { AngularRenderableNode, AngularRenderContext } from '../shared/node-helpers'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, forwardRef, Input } from '@angular/core'
import { getCustomNodeComponents } from '../../customComponents'
import { AdmonitionNodeComponent } from '../AdmonitionNode/AdmonitionNode.component'
import { BlockquoteNodeComponent } from '../BlockquoteNode/BlockquoteNode.component'
import { CheckboxNodeComponent } from '../CheckboxNode/CheckboxNode.component'
import { CodeBlockNodeComponent } from '../CodeBlockNode/CodeBlockNode.component'
import { D2BlockNodeComponent } from '../D2BlockNode/D2BlockNode.component'
import { DefinitionListNodeComponent } from '../DefinitionListNode/DefinitionListNode.component'
import { DynamicNodeHostComponent } from '../DynamicNodeHost/DynamicNodeHost.component'
import { EmojiNodeComponent } from '../EmojiNode/EmojiNode.component'
import { EmphasisNodeComponent } from '../EmphasisNode/EmphasisNode.component'
import { FallbackComponent } from '../FallbackComponent/FallbackComponent.component'
import { FootnoteAnchorNodeComponent } from '../FootnoteAnchorNode/FootnoteAnchorNode.component'
import { FootnoteNodeComponent } from '../FootnoteNode/FootnoteNode.component'
import { FootnoteReferenceNodeComponent } from '../FootnoteReferenceNode/FootnoteReferenceNode.component'
import { HardBreakNodeComponent } from '../HardBreakNode/HardBreakNode.component'
import { HeadingNodeComponent } from '../HeadingNode/HeadingNode.component'
import { HighlightNodeComponent } from '../HighlightNode/HighlightNode.component'
import { HtmlBlockNodeComponent } from '../HtmlBlockNode/HtmlBlockNode.component'
import { HtmlInlineNodeComponent } from '../HtmlInlineNode/HtmlInlineNode.component'
import { ImageNodeComponent } from '../ImageNode/ImageNode.component'
import { InfographicBlockNodeComponent } from '../InfographicBlockNode/InfographicBlockNode.component'
import { InlineCodeNodeComponent } from '../InlineCodeNode/InlineCodeNode.component'
import { InsertNodeComponent } from '../InsertNode/InsertNode.component'
import { LinkNodeComponent } from '../LinkNode/LinkNode.component'
import { ListItemNodeComponent } from '../ListItemNode/ListItemNode.component'
import { ListNodeComponent } from '../ListNode/ListNode.component'
import { MathBlockNodeComponent } from '../MathBlockNode/MathBlockNode.component'
import { MathInlineNodeComponent } from '../MathInlineNode/MathInlineNode.component'
import { MermaidBlockNodeComponent } from '../MermaidBlockNode/MermaidBlockNode.component'
import { ParagraphNodeComponent } from '../ParagraphNode/ParagraphNode.component'
import { PreCodeNodeComponent } from '../PreCodeNode/PreCodeNode.component'
import { ReferenceNodeComponent } from '../ReferenceNode/ReferenceNode.component'
import {
  coerceBuiltinHtmlNode,
  coerceCustomHtmlNode,
  resolveHtmlTag,
  resolveNodeOutletCodeMode,
  resolveNodeOutletCustomInputs,
} from '../shared/node-outlet-helpers'
import { StrikethroughNodeComponent } from '../StrikethroughNode/StrikethroughNode.component'
import { StrongNodeComponent } from '../StrongNode/StrongNode.component'
import { SubscriptNodeComponent } from '../SubscriptNode/SubscriptNode.component'
import { SuperscriptNodeComponent } from '../SuperscriptNode/SuperscriptNode.component'
import { TableNodeComponent } from '../TableNode/TableNode.component'
import { TextNodeComponent } from '../TextNode/TextNode.component'
import { ThematicBreakNodeComponent } from '../ThematicBreakNode/ThematicBreakNode.component'
import { VmrContainerNodeComponent } from '../VmrContainerNode/VmrContainerNode.component'

@Component({
  selector: 'markstream-angular-node-outlet',
  standalone: true,
  imports: [
    CommonModule,
    forwardRef(() => AdmonitionNodeComponent),
    forwardRef(() => BlockquoteNodeComponent),
    forwardRef(() => CheckboxNodeComponent),
    forwardRef(() => CodeBlockNodeComponent),
    forwardRef(() => D2BlockNodeComponent),
    forwardRef(() => DefinitionListNodeComponent),
    forwardRef(() => DynamicNodeHostComponent),
    forwardRef(() => EmojiNodeComponent),
    forwardRef(() => EmphasisNodeComponent),
    forwardRef(() => FallbackComponent),
    forwardRef(() => FootnoteAnchorNodeComponent),
    forwardRef(() => FootnoteNodeComponent),
    forwardRef(() => FootnoteReferenceNodeComponent),
    forwardRef(() => HardBreakNodeComponent),
    forwardRef(() => HeadingNodeComponent),
    forwardRef(() => HighlightNodeComponent),
    forwardRef(() => HtmlBlockNodeComponent),
    forwardRef(() => HtmlInlineNodeComponent),
    forwardRef(() => ImageNodeComponent),
    forwardRef(() => InfographicBlockNodeComponent),
    forwardRef(() => InlineCodeNodeComponent),
    forwardRef(() => InsertNodeComponent),
    forwardRef(() => LinkNodeComponent),
    forwardRef(() => ListItemNodeComponent),
    forwardRef(() => ListNodeComponent),
    forwardRef(() => MathBlockNodeComponent),
    forwardRef(() => MathInlineNodeComponent),
    forwardRef(() => MermaidBlockNodeComponent),
    forwardRef(() => ParagraphNodeComponent),
    forwardRef(() => PreCodeNodeComponent),
    forwardRef(() => ReferenceNodeComponent),
    forwardRef(() => StrikethroughNodeComponent),
    forwardRef(() => StrongNodeComponent),
    forwardRef(() => SubscriptNodeComponent),
    forwardRef(() => SuperscriptNodeComponent),
    forwardRef(() => TableNodeComponent),
    forwardRef(() => TextNodeComponent),
    forwardRef(() => ThematicBreakNodeComponent),
    forwardRef(() => VmrContainerNodeComponent),
  ],
  template: `
    <ng-container *ngIf="resolvedCustomComponent as customComponent; else builtinTemplate">
      <markstream-angular-dynamic-node-host
        [component]="customComponent"
        [node]="customNode"
        [context]="context"
        [indexKey]="indexKey"
        [inputs]="resolvedComponentInputs"
      />
    </ng-container>

    <ng-template #builtinTemplate>
      <ng-container [ngSwitch]="resolvedType">
        <markstream-angular-text-node *ngSwitchCase="'text'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-text-node *ngSwitchCase="'text_special'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-paragraph-node *ngSwitchCase="'paragraph'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-heading-node *ngSwitchCase="'heading'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-blockquote-node *ngSwitchCase="'blockquote'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-list-node *ngSwitchCase="'list'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-list-item-node *ngSwitchCase="'list_item'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-table-node *ngSwitchCase="'table'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-definition-list-node *ngSwitchCase="'definition_list'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-footnote-node *ngSwitchCase="'footnote'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-footnote-reference-node *ngSwitchCase="'footnote_reference'" [node]="node" />
        <markstream-angular-footnote-anchor-node *ngSwitchCase="'footnote_anchor'" [node]="node" />
        <markstream-angular-admonition-node *ngSwitchCase="'admonition'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-hardbreak-node *ngSwitchCase="'hardbreak'" />
        <markstream-angular-link-node *ngSwitchCase="'link'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-image-node *ngSwitchCase="'image'" [node]="node" />
        <markstream-angular-inline-code-node *ngSwitchCase="'inline_code'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-strong-node *ngSwitchCase="'strong'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-emphasis-node *ngSwitchCase="'emphasis'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-strikethrough-node *ngSwitchCase="'strikethrough'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-highlight-node *ngSwitchCase="'highlight'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-insert-node *ngSwitchCase="'insert'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-subscript-node *ngSwitchCase="'subscript'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-superscript-node *ngSwitchCase="'superscript'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-checkbox-node *ngSwitchCase="'checkbox'" [node]="node" />
        <markstream-angular-checkbox-node *ngSwitchCase="'checkbox_input'" [node]="node" />
        <markstream-angular-emoji-node *ngSwitchCase="'emoji'" [node]="node" />
        <markstream-angular-reference-node *ngSwitchCase="'reference'" [node]="node" />
        <markstream-angular-html-block-node *ngSwitchCase="'html_block'" [node]="htmlRenderNode" [context]="context" />
        <markstream-angular-html-inline-node *ngSwitchCase="'html_inline'" [node]="htmlRenderNode" [context]="context" />
        <markstream-angular-vmr-container-node *ngSwitchCase="'vmr_container'" [node]="node" [context]="context" [indexKey]="indexKey" />
        <markstream-angular-thematic-break-node *ngSwitchCase="'thematic_break'" />
        <markstream-angular-math-inline-node *ngSwitchCase="'math_inline'" [node]="node" />
        <markstream-angular-math-block-node *ngSwitchCase="'math_block'" [node]="node" />

        <ng-container *ngSwitchCase="'code_block'">
          <markstream-angular-mermaid-block-node
            *ngIf="codeMode === 'mermaid'; else nonMermaidCode"
            [node]="node"
            [context]="context"
          />
          <ng-template #nonMermaidCode>
            <markstream-angular-d2-block-node
              *ngIf="codeMode === 'd2'; else nonD2Code"
              [node]="node"
              [context]="context"
            />
          </ng-template>
          <ng-template #nonD2Code>
            <markstream-angular-infographic-block-node
              *ngIf="codeMode === 'infographic'; else genericCode"
              [node]="node"
              [context]="context"
            />
          </ng-template>
          <ng-template #genericCode>
            <markstream-angular-pre-code-node
              *ngIf="codeMode === 'pre'; else enhancedCode"
              [node]="node"
            />
          </ng-template>
          <ng-template #enhancedCode>
            <markstream-angular-code-block-node [node]="node" [context]="context" />
          </ng-template>
        </ng-container>

        <markstream-angular-fallback-node *ngSwitchDefault [node]="fallbackNode" [context]="context" [indexKey]="indexKey" />
      </ng-container>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NodeOutletComponent {
  @Input({ required: true }) node!: AngularRenderableNode
  @Input() context?: AngularRenderContext
  @Input() indexKey?: string

  get resolvedType() {
    return String((this.node as any)?.type || '')
  }

  get customComponentMap() {
    return this.context?.customComponents || getCustomNodeComponents(this.context?.customId)
  }

  get resolvedCustomComponent() {
    const customComponents = this.customComponentMap
    const direct = customComponents?.[this.resolvedType]
    if (direct)
      return direct

    if (this.resolvedType === 'code_block') {
      if (this.codeMode === 'mermaid' && customComponents?.mermaid)
        return customComponents.mermaid
      if (this.codeMode === 'd2' && customComponents?.d2)
        return customComponents.d2
      if (this.codeMode === 'infographic' && customComponents?.infographic)
        return customComponents.infographic
    }

    const tag = this.htmlTag
    return tag ? customComponents?.[tag] ?? null : null
  }

  get customNode() {
    return coerceCustomHtmlNode(this.node)
  }

  get codeMode() {
    return resolveNodeOutletCodeMode(this.node, this.context)
  }

  get htmlTag() {
    return resolveHtmlTag(this.node)
  }

  get htmlRenderNode() {
    return coerceBuiltinHtmlNode(this.node, this.resolvedType)
  }

  get fallbackNode() {
    return this.node
  }

  get resolvedComponentInputs() {
    return resolveNodeOutletCustomInputs(this.node, this.context)
  }
}
