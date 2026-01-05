<script lang="ts">
  import { ActionEntryButton } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import type { SubDirectoryInfo } from "$lib/modules/filesystem";
  import type { SelectedEntry } from "../service.svelte";

  import IconMoreVert from "~icons/material-symbols/more-vert";

  interface Props {
    info: SubDirectoryInfo;
    onclick: (entry: SelectedEntry) => void;
    onOpenMenuClick: (entry: SelectedEntry) => void;
  }

  let { info, onclick, onOpenMenuClick }: Props = $props();

  const action = (callback: typeof onclick) => {
    callback({ type: "directory", id: info.id, dataKey: info.dataKey, name: info.name });
  };
</script>

<ActionEntryButton
  class="h-14"
  onclick={() => action(onclick)}
  actionButtonIcon={IconMoreVert}
  onActionButtonClick={() => action(onOpenMenuClick)}
>
  <DirectoryEntryLabel type="directory" name={info.name} />
</ActionEntryButton>
