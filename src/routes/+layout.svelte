<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { goto as svelteGoto } from "$app/navigation";
  import { getUploadingFiles } from "$lib/modules/file";
  import {
    fileDownloadStatusStore,
    isFileDownloading,
    clientKeyStore,
    masterKeyStore,
  } from "$lib/stores";
  import "../app.css";

  let { children } = $props();

  const protectFileUploadAndDownload = (e: BeforeUnloadEvent) => {
    if (
      getUploadingFiles().length > 0 ||
      $fileDownloadStatusStore.some((status) => isFileDownloading(get(status).status))
    ) {
      e.preventDefault();
    }
  };

  onMount(async () => {
    const goto = async (url: string) => {
      const whitelist = ["/auth/login", "/key", "/client/pending"];
      if (!whitelist.some((path) => location.pathname.startsWith(path))) {
        await svelteGoto(
          `${url}?redirect=${encodeURIComponent(location.pathname + location.search)}`,
        );
      }
    };

    if (!$clientKeyStore) {
      await goto("/key/generate");
    } else if (!$masterKeyStore) {
      await goto("/client/pending");
    }
  });
</script>

<svelte:window onbeforeunload={protectFileUploadAndDownload} />

{@render children()}
