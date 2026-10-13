"use client";

import Link from "next/link";
import { forwardRef } from "react";
import type { ComponentProps, ReactNode } from "react";

import { SpinnerIcon } from "@/components/icons";

// The app's buttons. Each is a thin skin over the `.btn` / `.icon-btn` classes
// in globals.css, so a plain element with those classes and one of these
// components always look identical.

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

function buttonClass(variant: ButtonVariant, size: ButtonSize, pill?: boolean, extra?: string) {
  return [
    "btn",
    `btn-${variant}`,
    size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : "",
    pill ? "btn-pill" : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pill?: boolean;
  /** Shows a spinner in place of the icon and disables the button. */
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", pill, loading, icon, iconRight, className, children, disabled, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, pill, className)}
      {...rest}
    >
      {loading ? <SpinnerIcon className="animate-spin" /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

type LinkButtonProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pill?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
};

export function LinkButton({ variant = "secondary", size = "md", pill, icon, iconRight, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link className={buttonClass(variant, size, pill, className)} {...rest}>
      {icon}
      {children}
      {iconRight}
    </Link>
  );
}

type IconButtonProps = Omit<ComponentProps<"button">, "aria-label"> & {
  /** Required: an icon-only button has nothing else to be announced by. Also
      used as the hover tooltip unless `title` is given. */
  label: string;
  size?: "sm" | "md";
  active?: boolean;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = "md", active, className, title, type, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-label={label}
      title={title ?? label}
      data-active={active || undefined}
      className={["icon-btn", size === "sm" ? "icon-btn-sm" : "", className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
});
