<script lang="ts">
  import type { Writable } from "svelte/store";
  import { ActionEntryButton } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import type { DirectoryInfo } from "$lib/modules/filesystem";
  import type { DirectoryInfoStore } from "$lib/modules/filesystem2";
  import type { SelectedEntry } from "../service.svelte";

  import IconMoreVert from "~icons/material-symbols/more-vert";

  type SubDirectoryInfo = DirectoryInfo & { id: number };

  interface Props {
    info: DirectoryInfoStore;
    onclick: (selectedEntry: SelectedEntry) => void;
    onOpenMenuClick: (selectedEntry: SelectedEntry) => void;
  }

  let { info, onclick, onOpenMenuClick }: Props = $props();

  const openDirectory = () => {
    const { id, dataKey, dataKeyVersion, name } = $info.data as SubDirectoryInfo;
    if (!dataKey || !dataKeyVersion) return; // TODO: Error handling

    onclick({ type: "directory", id, dataKey, dataKeyVersion, name });
  };

  const openMenu = () => {
    const { id, dataKey, dataKeyVersion, name } = $info.data as SubDirectoryInfo;
    if (!dataKey || !dataKeyVersion) return; // TODO: Error handling

    onOpenMenuClick({ type: "directory", id, dataKey, dataKeyVersion, name });
  };
</script>

{#if $info}
  <ActionEntryButton
    class="h-14"
    onclick={openDirectory}
    actionButtonIcon={IconMoreVert}
    onActionButtonClick={openMenu}
  >
    <DirectoryEntryLabel type="directory" name={$info.data?.name!} />
  </ActionEntryButton>
{/if}
