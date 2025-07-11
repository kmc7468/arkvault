<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { BottomDiv, Button, FullscreenDiv, TextButton } from "$lib/components/atoms";
  import { TitledDiv } from "$lib/components/molecules";
  import { gotoStateful } from "$lib/hooks";
  import { storeClientKeys } from "$lib/modules/key";
  import { clientKeyStore } from "$lib/stores";
  import ForceLoginModal from "./ForceLoginModal.svelte";
  import Order from "./Order.svelte";
  import {
    generateClientKeys,
    generateInitialMasterKey,
    generateInitialHmacSecret,
    importClientKeys,
    requestClientRegistrationAndSessionUpgrade,
    requestInitialMasterKeyAndHmacSecretRegistration,
  } from "./service";

  import IconKey from "~icons/material-symbols/key";

  let { data } = $props();

  let fileInput: HTMLInputElement | undefined = $state();

  let isForceLoginModalOpen = $state(false);

  // TODO: Update
  const orders = [
    {
      title: "암호 키는 공개 키와 개인 키로 구성돼요.",
      description: "공개 키로 암호화된 데이터는 개인 키로만 복호화할 수 있어요.",
    },
    {
      title: "공개 키는 서버에 저장돼요.",
      description: "대신, 개인 키는 이 디바이스에만 저장돼요.",
    },
    {
      title: "다른 디바이스에서 공개 키를 이용해 데이터를 암호화하면,",
    },
    {
      title: "이 디바이스에서만 안전하게 복호화할 수 있어요.",
      description:
        "서버를 포함한 제3자는 데이터의 내용을 알 수 없어요. 개인 키가 이 디바이스에만 저장되기 때문이에요.",
    },
  ];

  const generateKeys = async () => {
    // TODO: Loading indicator

    const { encryptKey, ...clientKeys } = await generateClientKeys();
    const { masterKey, masterKeyWrapped } = await generateInitialMasterKey(encryptKey);
    const { hmacSecretWrapped } = await generateInitialHmacSecret(masterKey);

    await gotoStateful("/key/export", {
      ...clientKeys,
      redirectPath: data.redirectPath,
      masterKeyWrapped,
      hmacSecretWrapped,
    });
  };

  const importKeys = async () => {
    const file = fileInput?.files?.[0];
    if (!file) return;

    if (await importClientKeys(await file.text())) {
      await upgradeSession(false);
    } else {
      // TODO: Error Handling
    }

    fileInput!.value = "";
  };

  const upgradeSession = async (force: boolean) => {
    const [upgradeRes, upgradeError] = await requestClientRegistrationAndSessionUpgrade(
      $clientKeyStore!,
      force,
    );
    if (!force && upgradeError === "Already logged in") {
      isForceLoginModalOpen = true;
      return;
    } else if (!upgradeRes) {
      // TODO: Error Handling
      return;
    }

    const { masterKey, masterKeyWrapped } = await generateInitialMasterKey(
      $clientKeyStore!.encryptKey,
    );
    const { hmacSecretWrapped } = await generateInitialHmacSecret(masterKey);

    await storeClientKeys($clientKeyStore!);

    if (
      !(await requestInitialMasterKeyAndHmacSecretRegistration(
        masterKeyWrapped,
        hmacSecretWrapped,
        $clientKeyStore!.signKey,
      ))
    ) {
      // TODO: Error Handling
      return;
    }

    await goto("/client/pending?redirect=" + encodeURIComponent(data.redirectPath));
  };

  onMount(async () => {
    if ($clientKeyStore) {
      await goto(data.redirectPath, { replaceState: true });
    }
  });
</script>

<svelte:head>
  <title>암호 키 생성하기</title>
</svelte:head>

<input
  bind:this={fileInput}
  onchange={importKeys}
  type="file"
  accept="application/json"
  class="hidden"
/>

<FullscreenDiv>
  <TitledDiv childrenClass="space-y-4">
    {#snippet title()}
      암호 키 생성하기
    {/snippet}
    {#snippet description()}
      회원님의 디바이스 간의 안전한 데이터 동기화를 위해 암호 키를 생성해야 해요.
    {/snippet}

    <div>
      <IconKey class="mx-auto text-7xl" />
      <p class="text-center text-xl font-bold text-primary-500">왜 암호 키가 필요한가요?</p>
    </div>
    <div class="space-y-2">
      {#each orders as { title, description }, i}
        <Order order={i + 1} isLast={i === orders.length - 1} {title} {description} />
      {/each}
    </div>
  </TitledDiv>
  <BottomDiv class="flex flex-col items-center gap-y-2">
    <Button onclick={generateKeys} class="w-full">새 암호 키 생성하기</Button>
    <TextButton onclick={() => fileInput?.click()}>키를 갖고 있어요</TextButton>
  </BottomDiv>
</FullscreenDiv>

<ForceLoginModal bind:isOpen={isForceLoginModalOpen} onLoginClick={() => upgradeSession(true)} />
