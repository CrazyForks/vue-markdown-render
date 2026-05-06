<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import { hideTooltip, showTooltipForAnchor } from '../tooltip/singletonTooltip'
  import RenderChildren from './RenderChildren.svelte'
  import { getNodeList, getString } from './shared/node-helpers'
  
  interface Props {
    node: SvelteRenderableNode;
    context?: SvelteRenderContext;
    indexKey?: string | number;
    showTooltip?: boolean;
  }
  
  let { node, context, indexKey, showTooltip }: Props = $props();

  let href = $derived(getString((node as any)?.href));
  let title = $derived(getString((node as any)?.title || href));
  let children = $derived(getNodeList((node as any)?.children));
  let tooltipEnabled = $derived(showTooltip ?? context?.showTooltips ?? true);
  let isHashLink = $derived(href.startsWith('#') && href.length > 1);

  function showLinkTooltip(event: MouseEvent | FocusEvent) {
    if (!tooltipEnabled || !title)
      return
    showTooltipForAnchor(event.currentTarget as HTMLElement, title, 'top', false, undefined, context?.isDark)
  }

  function scrollToHashTarget(event: MouseEvent) {
    if (!isHashLink || typeof document === 'undefined')
      return
    event.preventDefault()
    const rawId = href.slice(1)
    const decodedId = safeDecodeHashId(rawId)
    const target = document.getElementById(rawId) || (decodedId !== rawId ? document.getElementById(decodedId) : null)
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function safeDecodeHashId(value: string) {
    try {
      return decodeURIComponent(value)
    }
    catch {
      return value
    }
  }
</script>
<a class:link-loading={Boolean((node as any)?.loading)} class="link-node" href={href || undefined} title={tooltipEnabled ? undefined : title} onblur={() => hideTooltip()} onclick={scrollToHashTarget} onfocus={showLinkTooltip} onmouseleave={() => hideTooltip()} onmouseenter={showLinkTooltip} target={isHashLink ? undefined : '_blank'} rel={isHashLink ? undefined : 'noreferrer noopener'}><span class="link-text-wrapper"><span class="link-text">{#if children.length}<RenderChildren nodes={children} context={context} prefix={String(indexKey ?? 'link') + '-link'} />{:else}{getString((node as any)?.text || href)}{/if}</span>{#if (node as any)?.loading}<span class="link-loading-indicator"></span>{/if}</span></a>
