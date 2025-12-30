<script lang="ts">
  import { onMount } from "svelte";
  import { goto as svelteGoto } from "$app/navigation";
  import { getDownloadingFiles, getUploadingFiles } from "$lib/modules/file";
  import { clientKeyStore, masterKeyStore } from "$lib/stores";
  import "../app.css";

  let { children } = $props();

  const protectFileUploadAndDownload = (e: BeforeUnloadEvent) => {
    if (getDownloadingFiles().length > 0 || getUploadingFiles().length > 0) {
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
