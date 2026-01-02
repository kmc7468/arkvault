<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { FullscreenDiv } from "$lib/components/atoms";
  import { TopBar } from "$lib/components/molecules";
  import { Gallery } from "$lib/components/organisms";
  import { bulkGetFileInfo, type MaybeFileInfo } from "$lib/modules/filesystem";
  import { masterKeyStore } from "$lib/stores";

  let { data } = $props();

  let files: MaybeFileInfo[] = $state([]);

  onMount(async () => {
    files = Array.from((await bulkGetFileInfo(data.files, $masterKeyStore?.get(1)?.key!)).values());
  });
</script>

<svelte:head>
  <title>사진 및 동영상</title>
</svelte:head>

<TopBar title="사진 및 동영상" />
<FullscreenDiv>
  <Gallery
    files={files.filter((file) => file?.exists)}
    onFileClick={({ id }) => goto(`/file/${id}?from=gallery`)}
  />
</FullscreenDiv>
