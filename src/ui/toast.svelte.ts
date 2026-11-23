// One toast at a time, optionally with an action (Undo within 10 s, §8.4).

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void | Promise<void> };
}

export const toasts = $state<{ current: Toast | null }>({ current: null });

let seq = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string, action?: Toast['action'], ms = action ? 10_000 : 4_000) {
  clearTimeout(timer);
  const toast = { id: ++seq, message, action };
  toasts.current = toast;
  timer = setTimeout(() => {
    if (toasts.current?.id === toast.id) toasts.current = null;
  }, ms);
}

export function dismissToast() {
  clearTimeout(timer);
  toasts.current = null;
}
