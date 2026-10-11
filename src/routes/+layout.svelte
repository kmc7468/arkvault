<script lang="ts">
  import { getDownloadingFiles, getUploadingFiles } from "#lib/client/transfer/index.js";
  import { Toasts } from "#lib/ui/index.js";
  import "../app.css";

  let { children } = $props();

  const protectFileUploadAndDownload = (e: BeforeUnloadEvent) => {
    if (getDownloadingFiles().length > 0 || getUploadingFiles().length > 0) {
      e.preventDefault();
    }
  };
</script>

<svelte:window onbeforeunload={protectFileUploadAndDownload} />

{@render children()}

<Toasts />
