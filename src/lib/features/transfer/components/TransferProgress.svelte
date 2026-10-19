<script lang="ts">
  import { formatNetworkSpeed } from "#lib/utils/index.ts";

  interface Props {
    progress?: number;
    rate?: number; // Bytes per second
  }

  let { progress, rate }: Props = $props();
</script>

전송됨 {Math.floor((progress ?? 0) * 100)}% · {formatNetworkSpeed((rate ?? 0) * 8)}
