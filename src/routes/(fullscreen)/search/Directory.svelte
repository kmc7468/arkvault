<script lang="ts">
  import { ActionEntryButton } from "#lib/components/atoms/index.js";
  import { DirectoryEntryLabel } from "#lib/components/molecules/index.js";
  import type { SubDirectoryInfo } from "#lib/features/filesystem/index.js";

  interface Props {
    info: SubDirectoryInfo;
    onclick: () => void;
  }

  let { info, onclick }: Props = $props();
</script>

<ActionEntryButton class="h-14" {onclick}>
  <DirectoryEntryLabel type="directory" name={info.name} isFavorite={info.isFavorite} />
</ActionEntryButton>
