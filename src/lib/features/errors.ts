import { showToast } from "#lib/ui/index.js";
import { isTRPCClientError } from "#trpc/client.js";

const getErrorMessage = (e: unknown, fallbackMessage: string) => {
  if (isTRPCClientError(e)) {
    switch (e.data?.code) {
      case "NOT_FOUND":
        return "대상을 찾을 수 없어요. 이미 삭제되었을 수 있어요.";
      case undefined:
        return "서버에 연결할 수 없어요.";
    }
  }
  return fallbackMessage;
};

export const showErrorToast = (e: unknown, fallbackMessage: string) => {
  console.error(e);
  showToast(getErrorMessage(e, fallbackMessage));
};

// Runs the action and shows the error to the user if it fails. Returns whether it succeeded.
export const tryAction = async (action: () => Promise<unknown>, errorMessage: string) => {
  try {
    await action();
    return true;
  } catch (e) {
    showErrorToast(e, errorMessage);
    return false;
  }
};
