<script lang="ts">
  import { goto } from "$app/navigation";
  import { BottomDiv, Button, FullscreenDiv, TextButton, TextInput } from "$lib/components/atoms";
  import { TitledDiv } from "$lib/components/molecules";
  import { clientKeyStore, masterKeyStore } from "$lib/stores";
  import { requestLogin, requestSessionUpgrade, requestMasterKeyDownload } from "./service";

  let { data } = $props();

  let email = $state("");
  let password = $state("");

  const redirect = async (url: string) => {
    return await goto(`${url}?redirect=${encodeURIComponent(data.redirectPath)}`);
  };

  const login = async () => {
    // TODO: Validation

    try {
      if (!(await requestLogin(email, password))) throw new Error("Failed to login");

      if (!$clientKeyStore) return await redirect("/key/generate");

      if (!(await requestSessionUpgrade($clientKeyStore)))
        throw new Error("Failed to upgrade session");

      // TODO: Multi-user support

      if (
        $masterKeyStore ||
        (await requestMasterKeyDownload($clientKeyStore.decryptKey, $clientKeyStore.verifyKey))
      ) {
        await goto(data.redirectPath);
      } else {
        await redirect("/client/pending");
      }
    } catch (e) {
      // TODO: Alert
      throw e;
    }
  };
</script>

<svelte:head>
  <title>로그인</title>
</svelte:head>

<FullscreenDiv>
  <TitledDiv childrenClass="flex flex-col gap-y-2">
    {#snippet title()}
      환영합니다!
    {/snippet}
    {#snippet description()}
      서비스를 이용하려면 로그인을 해야해요.
    {/snippet}

    <TextInput bind:value={email} placeholder="이메일" />
    <TextInput bind:value={password} placeholder="비밀번호" type="password" />
  </TitledDiv>
  <BottomDiv class="flex flex-col items-center gap-y-2">
    <Button onclick={login} class="w-full">로그인</Button>
    <TextButton>계정이 없어요</TextButton>
  </BottomDiv>
</FullscreenDiv>
