import { SpinnerIcon } from "./Icons";

interface LoadingProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  fullScreen?: boolean;
  variant?: "default" | "light";
}

export default function Loading({
  size = "md",
  text,
  fullScreen = false,
  variant = "default",
}: LoadingProps) {
  const sizes = {
    sm: "h-5 w-5",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  const spinnerColor =
    variant === "light" ? "text-white" : "text-maroon-800";
  const textColor =
    variant === "light" ? "text-white/90" : "text-gray-600";

  const content = (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3"
    >
      <SpinnerIcon className={`${spinnerColor} ${sizes[size]}`} />
      {text ? (
        <p className={`text-sm ${textColor}`}>{text}</p>
      ) : (
        <span className="sr-only">Loading…</span>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
        {content}
      </div>
    );
  }

  return content;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
      <Skeleton className="h-6 w-1/3 mb-4" />
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
