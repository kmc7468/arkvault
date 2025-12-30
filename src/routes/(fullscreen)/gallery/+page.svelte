<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { FullscreenDiv } from "$lib/components/atoms";
  import { TopBar } from "$lib/components/molecules";
  import { Gallery } from "$lib/components/organisms";
  import { getFileInfo, type FileInfo } from "$lib/modules/filesystem";
  import { masterKeyStore } from "$lib/stores";

  let { data } = $props();

  let files: (FileInfo | null)[] = $state([]);

  onMount(async () => {
    files = await Promise.all(
      data.files.map((file) => getFileInfo(file, $masterKeyStore?.get(1)?.key!)),
    );
  });
</script>

<svelte:head>
  <title>사진 및 동영상</title>
</svelte:head>

<TopBar title="사진 및 동영상" />
<FullscreenDiv>
  <Gallery
    files={files.filter((file) => !!file)}
    onFileClick={({ id }) => goto(`/file/${id}?from=gallery`)}
  />
</FullscreenDiv>
