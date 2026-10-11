<script lang="ts">
  import type { FileUploadState } from "#lib/client/transfer/index.ts";
  import TransferProgress from "./TransferProgress.svelte";

  interface Props {
    state: FileUploadState;
  }

  let { state }: Props = $props();

  const statusTexts = {
    queued: "대기 중",
    "encryption-pending": "준비 중",
    encrypting: "암호화하는 중",
    "upload-pending": "업로드를 기다리는 중",
    uploaded: "업로드 완료",
    canceled: "",
    error: "업로드 실패",
  } satisfies Record<Exclude<FileUploadState["status"], "uploading">, string>;
</script>

{#if state.status === "uploading"}
  <TransferProgress progress={state.progress} rate={state.rate} />
{:else}
  {statusTexts[state.status]}
{/if}
