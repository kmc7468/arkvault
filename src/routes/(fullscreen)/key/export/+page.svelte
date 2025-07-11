<script lang="ts">
  import FileSaver from "file-saver";
  import { goto } from "$app/navigation";
  import { BottomDiv, Button, FullscreenDiv, TextButton } from "$lib/components/atoms";
  import { TitledDiv } from "$lib/components/molecules";
  import { clientKeyStore } from "$lib/stores";
  import BeforeContinueBottomSheet from "./BeforeContinueBottomSheet.svelte";
  import BeforeContinueModal from "./BeforeContinueModal.svelte";
  import {
    serializeClientKeys,
    requestClientRegistration,
    storeClientKeys,
    requestSessionUpgrade,
    requestInitialMasterKeyAndHmacSecretRegistration,
  } from "./service";

  import IconKey from "~icons/material-symbols/key";

  let { data } = $props();

  let isBeforeContinueModalOpen = $state(false);
  let isBeforeContinueBottomSheetOpen = $state(false);

  const exportClientKeys = () => {
    const clientKeysSerialized = serializeClientKeys(
      data.encryptKeyBase64,
      data.decryptKeyBase64,
      data.signKeyBase64,
      data.verifyKeyBase64,
    );
    const clientKeysBlob = new Blob([JSON.stringify(clientKeysSerialized)], {
      type: "application/json",
    });
    FileSaver.saveAs(clientKeysBlob, "arkvault-clientkey.json");

    if (!isBeforeContinueBottomSheetOpen) {
      setTimeout(() => {
        isBeforeContinueBottomSheetOpen = true;
      }, 1000);
    }
  };

  const registerPubKeys = async () => {
    if (!$clientKeyStore) {
      throw new Error("Failed to find client keys");
    }

    try {
      if (
        !(await requestClientRegistration(
          data.encryptKeyBase64,
          $clientKeyStore.decryptKey,
          data.verifyKeyBase64,
          $clientKeyStore.signKey,
        ))
      )
        throw new Error("Failed to register client");

      await storeClientKeys($clientKeyStore);

      if (
        !(
          await requestSessionUpgrade(
            data.encryptKeyBase64,
            $clientKeyStore.decryptKey,
            data.verifyKeyBase64,
            $clientKeyStore.signKey,
          )
        )[0]
      )
        throw new Error("Failed to upgrade session");

      if (
        !(await requestInitialMasterKeyAndHmacSecretRegistration(
          data.masterKeyWrapped,
          data.hmacSecretWrapped,
          $clientKeyStore.signKey,
        ))
      )
        throw new Error("Failed to register initial MEK and HSK");

      await goto("/client/pending?redirect=" + encodeURIComponent(data.redirectPath));
    } catch (e) {
      // TODO: Error handling
      throw e;
    }
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

    <div class="space-y-2 break-keep text-lg text-gray-800">
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
