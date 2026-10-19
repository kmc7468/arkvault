<script lang="ts">
  import type { Component } from "svelte";
  import type { ClassValue, SvelteHTMLElements } from "svelte/elements";
  import { getFileThumbnail } from "#lib/client/cache/index.ts";
  import { ActionEntryButton, DirectoryEntryLabel } from "#lib/ui/index.ts";
  import { formatDateTime } from "#lib/utils/index.ts";
  import type { SummarizedFileInfo } from "../types.ts";

  interface Props {
    action?: {
      icon: Component<SvelteHTMLElements["svg"]>;
      onclick: () => void;
      class?: ClassValue;
    };
    info: SummarizedFileInfo;
    onclick?: () => void;
    showThumbnail?: boolean;
    subtext?: string;
  }

  let { action, info, onclick, showThumbnail = true, subtext }: Props = $props();

  let thumbnail = $derived(showThumbnail ? getFileThumbnail(info) : undefined);
</script>

<ActionEntryButton
  class="h-14"
  {onclick}
  actionButtonIcon={action?.icon}
  actionButtonClass={action?.class}
  onActionButtonClick={action?.onclick}
>
  <DirectoryEntryLabel
    type="file"
    thumbnail={thumbnail?.url}
    name={info.name}
    subtext={subtext ?? formatDateTime(info.createdAt ?? info.lastModifiedAt)}
    isFavorite={info.isFavorite}
  />
</ActionEntryButton>
