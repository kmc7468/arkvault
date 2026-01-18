<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { AdaptiveDiv } from "$lib/components/atoms";

  import IconHome from "~icons/material-symbols/home";
  import IconFolder from "~icons/material-symbols/folder";
  import IconFavorite from "~icons/material-symbols/favorite";
  import IconCategory from "~icons/material-symbols/category";
  import IconMenu from "~icons/material-symbols/menu";

  const pages = [
    { path: "/home", label: "홈", icon: IconHome },
    { path: "/directory", label: "파일", icon: IconFolder },
    { path: "/favorites", label: "즐겨찾기", icon: IconFavorite },
    { path: "/category", label: "카테고리", icon: IconCategory },
    { path: "/menu", label: "전체", icon: IconMenu },
  ];
</script>

<div class="sticky bottom-0 h-20 flex-shrink-0 rounded-t-2xl border-t border-gray-300 bg-white">
  <AdaptiveDiv class="flex justify-evenly px-4 py-2">
    {#each pages as { path, label, icon: Icon }}
      <button
        onclick={() => goto(path, { replaceState: true })}
        class={[
          "w-16 active:rounded-xl active:bg-gray-100",
          !page.url.pathname.startsWith(path) && "text-gray-600",
        ]}
      >
        <div class="flex flex-col items-center gap-y-1 p-1 transition active:scale-95">
          <Icon class="text-xl" />
          <p class="text-sm">{label}</p>
        </div>
      </button>
    {/each}
  </AdaptiveDiv>
</div>
