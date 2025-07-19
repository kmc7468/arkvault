<script lang="ts">
  import { ActionEntryButton } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import type { SubDirectoryInfo } from "$lib/modules/filesystem2";
  import type { SelectedEntry } from "../service.svelte";

  import IconMoreVert from "~icons/material-symbols/more-vert";

  interface Props {
    info: SubDirectoryInfo;
    onclick: (selectedEntry: SelectedEntry) => void;
    onOpenMenuClick: (selectedEntry: SelectedEntry) => void;
  }

  let { info, onclick, onOpenMenuClick }: Props = $props();

  const openDirectory = () => {
    const { id, dataKey, dataKeyVersion, name } = info;
    if (!dataKey || !dataKeyVersion) return; // TODO: Error handling

    onclick({ type: "directory", id, dataKey, dataKeyVersion, name });
  };

  const openMenu = () => {
    const { id, dataKey, dataKeyVersion, name } = info;
    if (!dataKey || !dataKeyVersion) return; // TODO: Error handling

    onOpenMenuClick({ type: "directory", id, dataKey, dataKeyVersion, name });
  };
</script>

<ActionEntryButton
  class="h-14"
  onclick={openDirectory}
  actionButtonIcon={IconMoreVert}
  onActionButtonClick={openMenu}
>
  <DirectoryEntryLabel type="directory" name={info.name} />
</ActionEntryButton>
