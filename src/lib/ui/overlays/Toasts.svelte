<script lang="ts">
  import { fly } from "svelte/transition";
  import { getToasts } from "./toast.svelte.ts";
</script>

<div class="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-y-2 px-4">
  {#each getToasts() as toast (toast.id)}
    <div
      role="alert"
      transition:fly={{ y: -8, duration: 200 }}
      class="max-w-md rounded-xl bg-gray-800 px-4 py-3 text-sm break-keep text-white shadow-lg"
    >
      {toast.message}
    </div>
  {/each}
</div>
