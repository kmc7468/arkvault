import type { DataKey } from "$lib/modules/filesystem";

export interface SelectedCategory {
  id: number;
  dataKey?: DataKey;
  name: string;
}
