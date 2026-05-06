<script lang="ts">
  import type { SvelteRenderableNode } from './shared/node-helpers'
  import { useSafeI18n } from '../i18n/useSafeI18n'
  import { getString } from './shared/node-helpers'

  export let node: SvelteRenderableNode
  export let fallbackSrc = ''
  export let lazy = false
  export let usePlaceholder = true

  const { t } = useSafeI18n()

  let imageLoaded = false
  let hasError = false
  let fallbackTried = false
  let currentSrc = ''
  let previousSrc = ''

  $: src = getString((node as any)?.src)
  $: alt = getString((node as any)?.alt)
  $: title = getString((node as any)?.title)
  $: raw = getString((node as any)?.raw)
  $: isLoading = Boolean((node as any)?.loading)
  $: useEagerImagePath = !lazy
  $: if (src !== previousSrc) {
    previousSrc = src
    currentSrc = src
    imageLoaded = false
    hasError = false
    fallbackTried = false
  }

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
      class:is-loaded={useEagerImagePath || imageLoaded}
      class:is-loading={!useEagerImagePath && !imageLoaded}
      class="image-node__img"
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
