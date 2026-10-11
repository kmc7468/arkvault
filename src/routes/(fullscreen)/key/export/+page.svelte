<script lang="ts">
  import FileSaver from "file-saver";
  import { goto } from "$app/navigation";
  import {
    keyring,
    registerInitialMasterKeyAndHmacSecret,
    requestClientRegistration,
    requestSessionUpgrade,
    serializeClientKeys,
  } from "#lib/client/keys/index.js";
  import {
    BottomDiv,
    Button,
    FullscreenDiv,
    TextButton,
    TitledDiv,
    showToast,
  } from "#lib/ui/index.js";
  import BeforeContinueBottomSheet from "./BeforeContinueBottomSheet.svelte";
  import BeforeContinueModal from "./BeforeContinueModal.svelte";

  import IconKey from "~icons/material-symbols/key";

  let { data } = $props();

  let isBeforeContinueModalOpen = $state(false);
  let isBeforeContinueBottomSheetOpen = $state(false);

  const exportClientKeys = () => {
    const clientKeysSerialized = serializeClientKeys(data);
    const clientKeysBlob = new Blob([clientKeysSerialized], { type: "application/json" });
    FileSaver.saveAs(clientKeysBlob, "arkvault-clientkey.json");

    if (!isBeforeContinueBottomSheetOpen) {
      setTimeout(() => {
        isBeforeContinueBottomSheetOpen = true;
      }, 1000);
    }
  };

  const registerPubKeys = async () => {
    if (!(await requestClientRegistration())) {
      showToast("이 디바이스를 등록하지 못했어요.");
      return;
    }

    await keyring.persistClientKeys();

    if (!(await requestSessionUpgrade())[0]) {
      showToast("로그인하지 못했어요.");
      return;
    }

    if (
      !(await registerInitialMasterKeyAndHmacSecret(data.masterKeyWrapped, data.hmacSecretWrapped))
    ) {
      showToast("암호 키를 등록하지 못했어요.");
      return;
    }

    await goto("/client/pending?redirect=" + encodeURIComponent(data.redirectPath));
  };
</script>

<svelte:head>
  <title>암호 키 생성하기</title>
</svelte:head>

<FullscreenDiv>
  <TitledDiv icon={IconKey}>
    {#snippet title()}
      암호 키를 파일로 내보낼까요?
    {/snippet}

    <div class="space-y-2 text-lg break-keep text-gray-800">
      <p>
        모든 디바이스의 암호 키가 유실되면, 서버에 저장된 데이터를 영원히 복호화할 수 없게 돼요.
      </p>
      <p>만약의 상황을 위해 암호 키를 파일로 내보낼 수 있어요.</p>
    </div>
  </TitledDiv>
  <BottomDiv class="flex flex-col items-center gap-y-2">
    <Button onclick={exportClientKeys} class="w-full">암호 키 내보내기</Button>
    <TextButton onclick={() => (isBeforeContinueModalOpen = true)}>내보내지 않을래요</TextButton>
  </BottomDiv>
</FullscreenDiv>

<BeforeContinueModal bind:isOpen={isBeforeContinueModalOpen} onContinueClick={registerPubKeys} />
<BeforeContinueBottomSheet
  bind:isOpen={isBeforeContinueBottomSheetOpen}
  onRetryClick={exportClientKeys}
  onContinueClick={registerPubKeys}
/>
