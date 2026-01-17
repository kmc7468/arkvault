<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  interface Props {
    class?: ClassValue;
    placeholder: string;
    type?: "text" | "password";
    value?: string;
  }

  let { class: className, placeholder, type = "text", value = $bindable("") }: Props = $props();
</script>

<div class={className}>
  <div class="relative mt-5">
    <input
      bind:value
      {type}
      placeholder=""
      class="w-full border-b-2 border-gray-300 py-1 text-xl outline-none transition duration-300 ease-in-out"
    />
    <!-- svelte-ignore a11y_label_has_associated_control -->
    <label
      class="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 transform text-xl text-gray-400 transition-all duration-300 ease-in-out"
    >
      {placeholder}
    </label>
  </div>
</div>

<style lang="postcss">
  input:focus,
  input:not(:placeholder-shown) {
    @apply border-primary-300;
  }
  input:focus + label,
  input:not(:placeholder-shown) + label {
    @apply top-0 -translate-y-full text-sm text-primary-400;
  }
</style>
