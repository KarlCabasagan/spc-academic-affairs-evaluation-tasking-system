import { useEffect, useState } from "react";
import { CheckIcon, CloseIcon, InfoCircleIcon } from "./Icons";
import {
  dismissToast,
  subscribeToasts,
  type ToastItem,
  type ToastType,
} from "./toastBus";

const TONE_STYLES: Record<ToastType, string> = {
  success: "bg-emerald-50 border-emerald-200 text-emerald-800",
  error: "bg-red-50 border-red-200 text-red-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
};

const ICON_COLORS: Record<ToastType, string> = {
  success: "text-emerald-700",
  error: "text-red-700",
  info: "text-blue-700",
};

function ToastIcon({ type }: { type: ToastType }) {
  const color = ICON_COLORS[type];
  if (type === "success") return <CheckIcon className={`w-5 h-5 shrink-0 ${color}`} />;
  if (type === "error") return <CloseIcon className={`w-5 h-5 shrink-0 ${color}`} />;
  return <InfoCircleIcon className={`w-5 h-5 shrink-0 ${color}`} />;
}

export default function ToastContainer() {
  const [currentToasts, setCurrentToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeToasts(setCurrentToasts);
  }, []);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      {currentToasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.type === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex items-center gap-3 pl-4 pr-2 py-2.5 rounded-lg border shadow-lg animate-modal-in ${TONE_STYLES[toast.type]}`}
        >
          <ToastIcon type={toast.type} />
          <p className="text-sm font-medium text-gray-800 flex-1">
            {toast.message}
          </p>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss notification"
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-md text-gray-500 hover:text-gray-800 hover:bg-black/5 transition-colors"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
