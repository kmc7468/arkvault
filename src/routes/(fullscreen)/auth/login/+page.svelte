<script lang="ts">
  import { goto } from "$app/navigation";
  import {
    BottomDiv,
    Button,
    FullscreenDiv,
    TextButton,
    TextInput,
  } from "#lib/components/atoms/index.js";
  import { TitledDiv } from "#lib/components/molecules/index.js";
  import { ForceLoginModal } from "#lib/components/organisms/index.js";
  import {
    downloadMasterKeys,
    keyring,
    requestClientRegistrationAndSessionUpgrade,
  } from "#lib/client/keys/index.js";
  import { showErrorToast, showToast } from "#lib/client/toast.svelte.js";
  import { login as requestLogin, logout as requestLogout } from "#lib/features/auth/index.js";
  import { cleanupDeletedFileCaches } from "#lib/features/filesystem/index.js";
  import { isTRPCClientError } from "#trpc/client.js";

  let { data } = $props();

  let email = $state("");
  let password = $state("");

  let isForceLoginModalOpen = $state(false);

  const redirect = async (url: string) => {
    return await goto(`${url}?redirect=${encodeURIComponent(data.redirectPath)}`);
  };

  const upgradeSession = async (force: boolean) => {
    const [upgradeRes, upgradeError] = await requestClientRegistrationAndSessionUpgrade(force);
    if (!force && upgradeError === "Already logged in") {
      isForceLoginModalOpen = true;
      return;
    } else if (!upgradeRes) {
      showToast("로그인하지 못했어요.");
      return;
    }

    // TODO: Multi-user support

    if (keyring.hasMasterKeys || (await downloadMasterKeys())) {
      await cleanupDeletedFileCaches().catch(console.error);
      await goto(data.redirectPath);
    } else {
      await redirect("/client/pending");
    }
  };

  const login = async () => {
    if (!email || !password) {
      showToast("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    try {
      await requestLogin(email, password);
    } catch (e) {
      if (isTRPCClientError(e) && e.data?.code === "UNAUTHORIZED") {
        showToast("이메일 또는 비밀번호가 올바르지 않아요.");
      } else {
        showErrorToast(e, "로그인하지 못했어요.");
      }
      return;
    }

    if (!keyring.clientKeys) return await redirect("/key/generate");

    await upgradeSession(false);
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

<ForceLoginModal
  bind:isOpen={isForceLoginModalOpen}
  oncancel={() => requestLogout().catch(console.error)}
  onLoginClick={() => upgradeSession(true)}
/>
