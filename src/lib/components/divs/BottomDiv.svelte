<script lang="ts">
  let { children } = $props();
</script>

<div class="sticky bottom-0 flex flex-col items-center gap-y-2 bg-white pb-4">
  {@render children?.()}
</div>
