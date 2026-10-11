<script lang="ts">
  interface Props {
    order: number;
    isLast?: boolean;
    title: string;
    description?: string;
  }

  let { order, isLast = false, title, description }: Props = $props();
</script>

<div class="flex gap-x-3">
  <div class="flex flex-col">
    <p
      class="flex size-8 items-center justify-center rounded-full bg-gray-200 text-lg font-bold text-gray-700"
    >
      {order}
    </p>
    {#if !isLast}
      <div class="mx-auto mt-2 w-0.5 grow rounded-full bg-gray-300"></div>
    {/if}
  </div>
  <div class="mb-5 space-y-1 break-keep">
    <p class="flex min-h-8 items-center text-lg font-medium">
      {title}
    </p>
    <p class="text-gray-600">
      {#if description}
        {description}
      {/if}
    </p>
  </div>
</div>
