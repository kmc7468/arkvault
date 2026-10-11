import { getContext, setContext } from "svelte";
import {
  deleteDirectory,
  deleteFile,
  renameDirectory,
  renameFile,
  setDirectoryFavorite,
  setFileFavorite,
  type DataKey,
} from "#lib/features/filesystem/index.js";

export interface SelectedEntry {
  type: "directory" | "file";
  id: number;
  parentId: DirectoryId;
  dataKey: DataKey | undefined;
  name: string;
  isFavorite: boolean;
}

export const createContext = () => {
  const context = $state({
    selectedEntry: undefined as SelectedEntry | undefined,
  });
  return setContext("context", context);
};

export const useContext = () => {
  return getContext<ReturnType<typeof createContext>>("context");
};

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
