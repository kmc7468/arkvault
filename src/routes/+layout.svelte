<script lang="ts">
  import { getDownloadingFiles, getUploadingFiles } from "#lib/modules/file/index.js";
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
