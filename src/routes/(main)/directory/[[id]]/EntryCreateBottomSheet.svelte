<script lang="ts">
  import { BottomSheet, IconEntryButton } from "#lib/ui/index.js";

  import IconCreateNewFolder from "~icons/material-symbols/create-new-folder";
  import IconUploadFile from "~icons/material-symbols/upload-file";

  interface Props {
    isOpen: boolean;
    onDirectoryCreateClick: () => void;
    onFileUploadClick: () => void;
  }

  let { isOpen = $bindable(), onDirectoryCreateClick, onFileUploadClick }: Props = $props();
</script>

<BottomSheet bind:isOpen class="p-4">
  <IconEntryButton
    icon={IconCreateNewFolder}
    onclick={onDirectoryCreateClick}
    class="h-16 w-full"
    iconClass="text-2xl! text-yellow-500"
  >
    폴더 만들기
  </IconEntryButton>
  <IconEntryButton
    icon={IconUploadFile}
    onclick={onFileUploadClick}
    class="h-16 w-full"
    iconClass="text-2xl! text-blue-400"
  >
    파일 업로드
  </IconEntryButton>
</BottomSheet>
