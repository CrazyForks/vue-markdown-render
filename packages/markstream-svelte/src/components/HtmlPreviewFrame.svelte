<script lang="ts">
  export let code = ''
  export let title = 'Preview'
  export let isDark = false
  export let htmlPreviewAllowScripts = false
  export let htmlPreviewSandbox: string | undefined = undefined
  export let onClose: (() => void) | undefined = undefined
  $: sandbox = htmlPreviewSandbox ?? (htmlPreviewAllowScripts ? 'allow-scripts' : '')
</script>
<div class:is-dark={isDark} class="html-preview-frame">
  <div class="html-preview-frame__header"><span>{title}</span><button type="button" onclick={() => onClose?.()}>Close</button></div>
  <iframe title={title} class="html-preview-frame__iframe" srcdoc={code} sandbox={sandbox}></iframe>
</div>
