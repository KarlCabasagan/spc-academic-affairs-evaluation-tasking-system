import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { SpinnerIcon } from "./Icons";
import {
  buttonVariants,
  type ButtonSize,
  type ButtonVariant,
} from "./buttonVariants";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = "",
      variant = "primary",
      size = "md",
      isLoading,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={buttonVariants({ variant, size, className })}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        {...props}
      >
        {isLoading && <SpinnerIcon className="h-4 w-4" />}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";

export default Button;
