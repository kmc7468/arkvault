<script lang="ts">
  import { goto } from "$app/navigation";
  import { BottomDiv, Button, FullscreenDiv, TextInput } from "$lib/components/atoms";
  import { TitledDiv, TopBar } from "$lib/components/molecules";
  import { requestPasswordChange } from "./service";

  let oldPassword = $state("");
  let newPassword = $state("");
  let confirmPassword = $state("");

  const changePassword = async () => {
    if (newPassword !== confirmPassword) {
      // TODO: Alert
      return;
    }

    if (await requestPasswordChange(oldPassword, newPassword)) {
      await goto("/menu");
    }
  };
</script>

<svelte:head>
  <title>비밀번호 바꾸기</title>
</svelte:head>

<TopBar class="flex-shrink-0" />
<FullscreenDiv>
  <TitledDiv class="!pt-0" titleClass="!text-2xl" childrenClass="flex flex-col gap-y-2">
    {#snippet title()}
      기존 비밀번호와 새 비밀번호를 입력해 주세요.
    {/snippet}
    {#snippet description()}
      새 비밀번호는 8자 이상이어야 해요. 다른 사람들이 알 수 없도록 안전하게 설정해 주세요.
    {/snippet}

    <TextInput bind:value={oldPassword} placeholder="기존 비밀번호" type="password" />
    <TextInput bind:value={newPassword} placeholder="새 비밀번호" type="password" />
    <TextInput bind:value={confirmPassword} placeholder="새 비밀번호 확인" type="password" />
  </TitledDiv>
  <BottomDiv>
    <Button onclick={changePassword} class="w-full">비밀번호 바꾸기</Button>
  </BottomDiv>
</FullscreenDiv>
