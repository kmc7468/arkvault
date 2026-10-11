import { getContext, setContext } from "svelte";
import type { SelectedCategory } from "#lib/components/molecules/index.js";

export interface SelectedFile {
  id: number;
  name: string;
}

export const createContext = () => {
  const context = $state({
    selectedCategory: undefined as SelectedCategory | undefined,
  });
  return setContext("context", context);
};

export const useContext = () => {
  return getContext<ReturnType<typeof createContext>>("context");
};
