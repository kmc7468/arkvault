import { createContext as createSvelteContext } from "svelte";
import {
  deleteDirectory,
  deleteFile,
  renameDirectory,
  renameFile,
  setDirectoryFavorite,
  setFileFavorite,
  type DataKey,
} from "#lib/features/filesystem/index.ts";

export interface SelectedEntry {
  type: "directory" | "file";
  id: number;
  parentId: DirectoryId;
  dataKey: DataKey | undefined;
  name: string;
  isFavorite: boolean;
}

interface Context {
  selectedEntry?: SelectedEntry;
}

const [getContext, setContext] = createSvelteContext<Context>();

export const createContext = () => {
  const context: Context = $state({});
  return setContext(context);
};

export const useContext = getContext;

export const renameEntry = async (entry: SelectedEntry, newName: string) => {
  if (entry.type === "directory") {
    await renameDirectory(entry, newName);
  } else {
    await renameFile(entry, newName);
  }
};

export const deleteEntry = async (entry: SelectedEntry) => {
  if (entry.type === "directory") {
    await deleteDirectory(entry);
  } else {
    await deleteFile(entry);
  }
};

export const toggleEntryFavorite = async (entry: SelectedEntry) => {
  if (entry.type === "directory") {
    await setDirectoryFavorite(entry, !entry.isFavorite);
  } else {
    await setFileFavorite(entry, !entry.isFavorite);
  }
};
