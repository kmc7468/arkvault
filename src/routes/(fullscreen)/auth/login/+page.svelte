<script lang="ts">
  import { goto } from "$app/navigation";
  import {
    downloadMasterKeys,
    keyring,
    requestClientRegistrationAndSessionUpgrade,
  } from "#lib/client/keys/index.ts";
  import { ForceLoginModal } from "#lib/features/auth/components/index.ts";
  import { login as requestLogin, logout as requestLogout } from "#lib/features/auth/index.ts";
  import { showErrorToast } from "#lib/features/errors.ts";
  import { cleanupDeletedFileCaches } from "#lib/features/filesystem/index.ts";
  import { withRedirectPath } from "#lib/shared/redirect.ts";
  import {
    BottomDiv,
    Button,
    FullscreenDiv,
    TextButton,
    TextInput,
    TitledDiv,
    showToast,
  } from "#lib/ui/index.ts";
  import { isTRPCClientError } from "#trpc/client.ts";

  let { data } = $props();

  let email = $state("");
  let password = $state("");

  let isForceLoginModalOpen = $state(false);

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
      await goto(withRedirectPath("/client/pending", data.redirectPath));
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

    if (!keyring.clientKeys)
      return await goto(withRedirectPath("/key/generate", data.redirectPath));

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
