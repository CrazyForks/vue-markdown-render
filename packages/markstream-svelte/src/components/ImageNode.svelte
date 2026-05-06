<script lang="ts">
  import type { SvelteRenderableNode } from './shared/node-helpers'
  import { useSafeI18n } from '../i18n/useSafeI18n'
  import { getString } from './shared/node-helpers'

  import { untrack } from 'svelte'

  let {
    node,
    fallbackSrc = '',
    lazy = false,
    usePlaceholder = true
  }: {
    node: SvelteRenderableNode;
    fallbackSrc?: string;
    lazy?: boolean;
    usePlaceholder?: boolean;
  } = $props()

  const { t } = useSafeI18n()

  let src = $derived(getString((node as any)?.src))
  let alt = $derived(getString((node as any)?.alt))
  let title = $derived(getString((node as any)?.title))
  let raw = $derived(getString((node as any)?.raw))
  let isLoading = $derived(Boolean((node as any)?.loading))
  let useEagerImagePath = $derived(!lazy)

  let initialSrc = untrack(() => getString((node as any)?.src))
  let previousSrc = $state(initialSrc)
  let currentSrc = $state(initialSrc)
  let imageLoaded = $state(false)
  let hasError = $state(false)
  let fallbackTried = $state(false)

  $effect.pre(() => {
    if (src !== previousSrc) {
      previousSrc = src
      currentSrc = src
      imageLoaded = false
      hasError = false
      fallbackTried = false
    }
  })

  function handleImageError() {
    if (fallbackSrc && !fallbackTried) {
      fallbackTried = true
      currentSrc = fallbackSrc
      imageLoaded = false
      hasError = false
      return
    }
    hasError = true
    imageLoaded = false
  }

  function handleImageLoad(event: Event) {
    const image = event.currentTarget as HTMLImageElement | null
    if (image && image.naturalWidth === 0 && image.naturalHeight === 0) {
      handleImageError()
      return
    }
    imageLoaded = true
    hasError = false
  }
</script>

<span class="image-node-container">
  {#if !isLoading && !hasError}
    <img
      class={[
        "image-node__img",
        (useEagerImagePath || imageLoaded) && "is-loaded",
        (!useEagerImagePath && !imageLoaded) && "is-loading"
      ]}
      src={currentSrc}
      alt={alt}
      title={title || alt || undefined}
      loading={lazy ? 'lazy' : undefined}
      fetchpriority={useEagerImagePath ? 'high' : undefined}
      decoding={useEagerImagePath ? 'sync' : 'async'}
      aria-label={alt || t('image.preview')}
      onerror={handleImageError}
      onload={handleImageLoad}
    />
  {:else if !hasError}
    <span class="image-placeholder">
      {#if usePlaceholder}
        <span class="image-shimmer"></span>
      {:else}
        <span class="image-node__raw-text">{raw}</span>
      {/if}
    </span>
  {:else}
    <span class="image-error">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2 2h20v10h-2V4H4v9.586l5-5L14.414 14L13 15.414l-4-4l-5 5V20h8v2H2zm13.547 5a1 1 0 1 0 0 2a1 1 0 0 0 0-2m-3 1a3 3 0 1 1 6 0a3 3 0 0 1-6 0m3.625 6.757L19 17.586l2.828-2.829l1.415 1.415L20.414 19l2.829 2.828l-1.415 1.415L19 20.414l-2.828 2.829l-1.415-1.415L17.586 19l-2.829-2.828z" /></svg>
      <span>{t('image.loadError')}</span>
    </span>
  {/if}
</span>
