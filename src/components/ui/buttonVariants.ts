export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonVariantOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

const BASE_STYLES =
  "inline-flex items-center justify-center font-medium rounded-lg transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-maroon-800 text-white hover:bg-maroon-700 focus-visible:ring-maroon-800 shadow-sm hover:shadow-md",
  secondary:
    "bg-white text-maroon-800 border border-maroon-200 hover:bg-maroon-50 focus-visible:ring-maroon-800",
  danger:
    "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600 shadow-sm",
  ghost:
    "text-gray-700 hover:text-maroon-800 hover:bg-gray-100 focus-visible:ring-maroon-800",
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "text-sm px-3 py-2 gap-1.5 min-h-9 relative before:content-[''] before:absolute before:-inset-y-1.5 before:inset-x-0",
  md: "text-sm px-4 py-2.5 gap-2 min-h-11",
  lg: "text-base px-6 py-3 gap-2 min-h-12",
};

export function buttonVariants({
  variant = "primary",
  size = "md",
  className = "",
}: ButtonVariantOptions = {}): string {
  return `${BASE_STYLES} ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]} ${className}`.trim();
}
