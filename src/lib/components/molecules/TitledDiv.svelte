<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import type { ClassValue, SvelteHTMLElements } from "svelte/elements";
  import { TitleLabel } from "#lib/components/molecules/index.js";

  interface Props {
    children?: Snippet;
    childrenClass?: ClassValue;
    class?: ClassValue;
    description?: Snippet;
    icon?: Component<SvelteHTMLElements["svg"]>;
    title: Snippet;
    titleClass?: ClassValue;
  }

  let {
    children,
    childrenClass: childrenClassName,
    class: className,
    description,
    icon,
    title,
    titleClass: titleClassName,
  }: Props = $props();
</script>

<div class={["space-y-4 py-4", className]}>
  <div class="space-y-2 break-keep">
    <TitleLabel {icon} textClass={titleClassName}>
      {@render title()}
    </TitleLabel>
    {#if description}
      <p>
        {@render description()}
      </p>
    {/if}
  </div>
  {#if children}
    <div class={childrenClassName}>
      {@render children()}
    </div>
  {/if}
</div>
