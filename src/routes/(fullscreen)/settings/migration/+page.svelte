<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { BottomDiv, Button, FullscreenDiv } from "$lib/components/atoms";
  import { TopBar } from "$lib/components/molecules";
  import { bulkGetFileInfo, type MaybeFileInfo } from "$lib/modules/filesystem";
  import { masterKeyStore } from "$lib/stores";
  import { sortEntries } from "$lib/utils";
  import File from "./File.svelte";
  import { getMigrationState, clearMigrationStates, requestFileMigration } from "./service.svelte";

  let { data } = $props();

  let fileInfos: MaybeFileInfo[] = $state([]);
  let files = $derived(
    fileInfos
      .map((info) => ({
        info,
        state: getMigrationState(info.id),
      }))
      .filter((file) => file.state?.status !== "completed"),
  );

  const migrateAllFiles = () => {
    files.forEach(({ info }) => {
      if (info.exists) {
        requestFileMigration(info);
      }
    });
  };

  onMount(async () => {
    fileInfos = sortEntries(
      Array.from((await bulkGetFileInfo(data.files, $masterKeyStore?.get(1)?.key!)).values()),
    );
  });

  $effect(() => clearMigrationStates);
</script>

<svelte:head>
  <title>암호화 마이그레이션</title>
</svelte:head>

<TopBar title="암호화 마이그레이션" />
<FullscreenDiv>
  {#if files.length > 0}
    <div class="space-y-4 pb-4">
      <p class="break-keep text-gray-800">
        이전 버전의 ArkVault에서 업로드된 {files.length}개 파일을 다시 암호화할 수 있어요.
      </p>
      <div class="space-y-2">
        {#each files as { info, state } (info.id)}
          {#if info.exists}
            <File
              {info}
              {state}
              onclick={({ id }) => goto(`/file/${id}`)}
              onMigrateClick={requestFileMigration}
            />
          {/if}
        {/each}
      </div>
    </div>
    <BottomDiv>
      <Button onclick={migrateAllFiles} class="w-full">모두 다시 암호화하기</Button>
    </BottomDiv>
  {:else}
    <div class="flex flex-grow items-center justify-center">
      <p class="text-gray-500">
        {#if data.files.length === 0}
          마이그레이션할 파일이 없어요.
        {:else}
          파일 목록을 불러오고 있어요.
        {/if}
      </p>
    </div>
  {/if}
</FullscreenDiv>
