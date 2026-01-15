<script lang="ts">
  import { ActionEntryButton } from "$lib/components/atoms";
  import { DirectoryEntryLabel } from "$lib/components/molecules";
  import type { SubDirectoryInfo } from "$lib/modules/filesystem";

  interface Props {
    info: SubDirectoryInfo;
    onclick: () => void;
  }

  let { info, onclick }: Props = $props();
</script>

<ActionEntryButton class="h-14" {onclick}>
  <DirectoryEntryLabel type="directory" name={info.name} />
</ActionEntryButton>
