<script lang="ts">
  import { afterPress } from "#lib/ui/index.ts";

  interface Props {
    color: "blue" | "green";
    count: number;
    label: string;
    onclick: () => void;
  }

  let { color, count, label, onclick }: Props = $props();

  const colorClasses = {
    blue: { button: "bg-blue-100 active:bg-blue-200", count: "text-blue-800" },
    green: { button: "bg-green-100 active:bg-green-200", count: "text-green-800" },
  };
</script>

{#if count > 0}
  <button
    onclick={afterPress(onclick)}
    class={["mb-4 max-w-[50%] flex-1 rounded-xl p-3", colorClasses[color].button]}
  >
    <div class="text-left transition active:scale-95">
      <p class="text-xs text-gray-800">{label}</p>
      <p class={["font-medium", colorClasses[color].count]}>{count}개</p>
    </div>
  </button>
{/if}
