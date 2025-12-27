import { goto } from "$app/navigation";

type Path = "/key/export";

interface KeyExportState {
  redirectPath: string;

  encryptKeyBase64: string;
  decryptKeyBase64: string;
  signKeyBase64: string;
  verifyKeyBase64: string;

  masterKeyWrapped: string;
  hmacSecretWrapped: string;
}

const useAutoNull = <T>(value: T | null) => {
  return {
    get: () => {
      const result = value;
      value = null;
      return result;
    },
    set: (newValue: T) => {
      value = newValue;
    },
  };
};

export const keyExportState = useAutoNull<KeyExportState>(null);

export function gotoStateful(path: "/key/export", state: KeyExportState): Promise<void>;

export function gotoStateful(path: Path, state: unknown) {
  switch (path) {
    case "/key/export":
      keyExportState.set(state as KeyExportState);
      return goto(path);
  }
}
