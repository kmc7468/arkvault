<script lang="ts">
  import { QueryClient, QueryClientProvider } from "@tanstack/svelte-query";
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { browser } from "$app/environment";
  import { goto as svelteGoto } from "$app/navigation";
  import {
    fileUploadStatusStore,
    fileDownloadStatusStore,
    isFileUploading,
    isFileDownloading,
    clientKeyStore,
    masterKeyStore,
  } from "$lib/stores";

  import "../app.css";

  let { children } = $props();

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        enabled: browser,
      },
    },
  });

  const protectFileUploadAndDownload = (e: BeforeUnloadEvent) => {
    if (
      $fileUploadStatusStore.some((status) => isFileUploading(get(status).status)) ||
      $fileDownloadStatusStore.some((status) => isFileDownloading(get(status).status))
    ) {
      e.preventDefault();
    }
  };

  onMount(async () => {
    window.__TANSTACK_QUERY_CLIENT__ = queryClient;

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

<QueryClientProvider client={queryClient}>
  {@render children()}
</QueryClientProvider>
