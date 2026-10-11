import { createContext as createSvelteContext } from "svelte";
import type { SelectedCategory } from "#lib/features/filesystem/components/index.js";

export interface SelectedFile {
  id: number;
  name: string;
}

interface Context {
  selectedCategory?: SelectedCategory;
}

const [getContext, setContext] = createSvelteContext<Context>();

export const createContext = () => {
  const context: Context = $state({});
  return setContext(context);
};

export const useContext = getContext;
