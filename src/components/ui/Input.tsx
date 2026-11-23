import { forwardRef, useId, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { EyeIcon, EyeOffIcon } from "./Icons";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  showPasswordToggle?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className = "",
      label,
      error,
      helperText,
      id,
      type,
      showPasswordToggle,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;
    const [showPassword, setShowPassword] = useState(false);

    const isPasswordField = type === "password";
    const shouldShowToggle = isPasswordField && showPasswordToggle;
    const inputType = isPasswordField && showPassword ? "text" : type;

    const describedBy = error
      ? errorId
      : helperText
        ? helperId
        : props["aria-describedby"];

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={inputType}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={`
              w-full px-4 py-2.5 rounded-lg border transition-colors duration-150
              text-gray-900 placeholder-gray-500
              focus:outline-none focus:ring-2 focus:ring-offset-0
              ${
                error
                  ? "border-red-300 focus:border-red-500 focus:ring-red-200"
                  : "border-gray-200 focus:border-maroon-500 focus:ring-maroon-100"
              }
              disabled:bg-gray-50 disabled:text-gray-600 disabled:cursor-not-allowed
              ${shouldShowToggle ? "pr-12" : ""}
              ${className}
            `}
            {...props}
          />
          {shouldShowToggle && (
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-md text-gray-500 hover:text-gray-700 transition-colors before:content-[''] before:absolute before:-inset-0.5"
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          )}
        </div>
        {error && (
          <p id={errorId} role="alert" className="mt-1.5 text-sm text-red-700">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="mt-1.5 text-sm text-gray-600">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

export default Input;
