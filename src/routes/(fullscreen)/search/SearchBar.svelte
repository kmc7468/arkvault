<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import IconArrowBack from "~icons/material-symbols/arrow-back";

  interface Props {
    class?: ClassValue;
    value: string;
  }

  let { class: className, value = $bindable() }: Props = $props();
</script>

<div class={["sticky top-0 z-10 flex items-center gap-x-2 px-2 py-3 backdrop-blur-2xl", className]}>
  <button
    onclick={() => history.back()}
    class="w-[2.3rem] flex-shrink-0 rounded-full p-1 active:bg-black active:bg-opacity-[0.04]"
  >
    <IconArrowBack class="text-2xl" />
  </button>
  <input
    bind:value
    type="text"
    placeholder="검색"
    class="mr-1 h-[2.3rem] flex-grow rounded-lg bg-gray-100 px-3 py-1.5 placeholder-gray-600 focus:outline-none"
  />
</div>
