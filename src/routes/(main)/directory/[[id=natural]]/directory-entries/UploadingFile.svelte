<script lang="ts">
  import type { LiveFileUploadState } from "#lib/client/transfer/index.ts";
  import { UploadStatusText } from "#lib/features/transfer/components/index.ts";

  import IconDraft from "~icons/material-symbols/draft";

  interface Props {
    state: LiveFileUploadState;
  }

  let { state }: Props = $props();
</script>

<div class="flex h-14 gap-x-4 p-2">
  <div class="flex size-10 shrink-0 items-center justify-center text-xl">
    <IconDraft class="text-gray-600" />
  </div>
  <div class="flex grow flex-col overflow-hidden text-gray-800">
    <p title={state.name} class="truncate font-medium">
      {state.name}
    </p>
    <p class="text-xs">
      <UploadStatusText {state} />
    </p>
  </div>
</div>
