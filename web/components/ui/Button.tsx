"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger-ghost";
type ButtonSize = "md" | "sm";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // ACID slab: the single physical primary per screen. Flat, square, confident.
  primary: "slab-press bg-acid font-display text-[17px] tracking-wide text-background disabled:opacity-60",
  secondary: "border hairline text-foreground disabled:opacity-60",
  ghost: "text-foreground underline decoration-faint underline-offset-4 disabled:opacity-60",
  "danger-ghost": "text-danger disabled:opacity-60",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "h-13 min-h-[52px] px-5 text-base",
  sm: "h-11 px-4 text-sm",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
}

/** Single button system: fixed heights, visible focus, spinner state. */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel,
  disabled,
  children,
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`flex items-center justify-center gap-2 rounded-[2px] font-medium transition-opacity active:scale-[0.98] ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {loading && (
        <span
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}
