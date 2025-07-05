<script lang="ts">
  import { goto } from "$app/navigation";
  import MenuEntryButton from "./MenuEntryButton.svelte";
  import { requestLogout } from "./service";

  import IconStorage from "~icons/material-symbols/storage";
  import IconImage from "~icons/material-symbols/image";
  import IconPassword from "~icons/material-symbols/password";
  import IconLogout from "~icons/material-symbols/logout";

  let { data } = $props();

  const logout = async () => {
    if (await requestLogout()) {
      await goto("/auth/login");
    }
  };
</script>

<svelte:head>
  <title>메뉴</title>
</svelte:head>

<div class="sticky top-0 bg-white px-6 py-4">
  <p class="font-semibold">{data.nickname}</p>
</div>
<div class="space-y-4 px-4 pb-4">
  <div class="space-y-2">
    <p class="font-semibold">설정</p>
    <MenuEntryButton
      onclick={() => goto("/settings/cache")}
      icon={IconStorage}
      iconColor="text-green-500"
    >
      캐시
    </MenuEntryButton>
    <MenuEntryButton
      onclick={() => goto("/settings/thumbnails")}
      icon={IconImage}
      iconColor="text-blue-500"
    >
      썸네일
    </MenuEntryButton>
  </div>
  <div class="space-y-2">
    <p class="font-semibold">보안</p>
    <MenuEntryButton
      onclick={() => goto("/auth/changePassword")}
      icon={IconPassword}
      iconColor="text-blue-500"
    >
      비밀번호 바꾸기
    </MenuEntryButton>
    <MenuEntryButton onclick={logout} icon={IconLogout} iconColor="text-red-500">
      로그아웃
    </MenuEntryButton>
  </div>
</div>
