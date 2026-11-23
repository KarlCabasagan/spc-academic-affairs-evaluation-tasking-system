export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

type ToastListener = (toasts: ToastItem[]) => void;

let listeners: ToastListener[] = [];
let toasts: ToastItem[] = [];
let fallbackSeq = 0;

function notifyListeners() {
  const snapshot = [...toasts];
  listeners.forEach((listener) => listener(snapshot));
}

export function dismissToast(id: string) {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length !== toasts.length) {
    toasts = next;
    notifyListeners();
  }
}

export function showToast(message: string, type: ToastType = "info") {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `toast-${++fallbackSeq}`;

  toasts = [...toasts, { id, message, type }];
  notifyListeners();

  window.setTimeout(() => {
    dismissToast(id);
  }, 4000);
}

export function subscribeToasts(listener: ToastListener): () => void {
  listeners.push(listener);
  listener([...toasts]);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}
