export interface Toast {
  id: number;
  message: string;
}

const TOAST_DURATION = 3000;

let toasts: Toast[] = $state([]);
let nextId = 0;

export const getToasts = () => toasts;

export const showToast = (message: string) => {
  const toast = { id: nextId++, message };
  toasts.push(toast);
  setTimeout(() => {
    toasts = toasts.filter(({ id }) => id !== toast.id);
  }, TOAST_DURATION);
};
