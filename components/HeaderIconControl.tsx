"use client";

import {
  type FocusEvent,
  type MouseEventHandler,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import Link from "next/link";

const TOOLTIP_DELAY_MS = 450;

/** Shared icon metrics for Saved / Watched text links */
export const HEADER_NAV_ICON = {
  size: 15,
  strokeWidth: 1.35,
} as const;

/** Icon size inside the Log in circle */
export const HEADER_LOGIN_ICON = {
  size: 11,
  strokeWidth: 1.5,
} as const;

export function headerIconControlClass() {
  return [
    "inline-flex shrink-0 cursor-pointer items-center gap-[6px] whitespace-nowrap",
    // Taller tap targets on mobile; width follows icon/label so the row still fits
    "min-h-11 justify-center px-2.5 sm:min-h-0 sm:justify-start sm:px-0",
    "bg-transparent",
    "font-sans text-[14px] font-normal leading-[1.18] tracking-tight",
    "antialiased [font-synthesis:none]",
    "text-[#1A1B2E] transition-[opacity,color] duration-150 ease-out",
    "[&_svg]:h-[18px] [&_svg]:w-[18px] sm:[&_svg]:h-[15px] sm:[&_svg]:w-[15px]",
    "focus-visible:rounded-sm focus-visible:outline focus-visible:outline-1",
    "focus-visible:outline-offset-[3px] focus-visible:outline-[rgba(26,27,46,0.28)]",
  ].join(" ");
}

function headerNavLabelClass(isActive: boolean, labelClassName?: string) {
  return [
    "relative",
    // Prefer collapse classes when present — a base `inline-block` would override `hidden`.
    labelClassName ?? "inline-block",
    isActive
      ? "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-[-2px] after:h-px after:bg-[rgba(177,169,217,0.35)] after:content-['']"
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Progressive label collapse with mobile exception: the active item always
 * keeps its text on small screens; inactive items stay icon-only until `from`.
 * Class strings are complete literals for the Tailwind scanner.
 */
export function headerNavLabelCollapse(
  isActive: boolean,
  from: "sm" | "md" | "lg"
): { labelClassName: string; iconActiveClassName?: string } {
  if (from === "sm") {
    return {
      labelClassName: isActive ? "inline-block" : "hidden sm:inline-block",
    };
  }

  if (from === "md") {
    return {
      labelClassName: isActive
        ? "inline-block sm:hidden md:inline-block"
        : "hidden md:inline-block",
      iconActiveClassName: isActive
        ? "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-[-2px] after:h-px after:bg-[rgba(177,169,217,0.35)] after:content-[''] after:hidden sm:after:block md:after:hidden"
        : undefined,
    };
  }

  return {
    labelClassName: isActive
      ? "inline-block sm:hidden lg:inline-block"
      : "hidden lg:inline-block",
    iconActiveClassName: isActive
      ? "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-[-2px] after:h-px after:bg-[rgba(177,169,217,0.35)] after:content-[''] after:hidden sm:after:block lg:after:hidden"
      : undefined,
  };
}

function headerNavIconWrapClass(isActive: boolean, iconActiveClassName?: string) {
  if (!isActive || !iconActiveClassName) {
    return "inline-flex shrink-0";
  }

  return ["relative inline-flex shrink-0", iconActiveClassName].join(" ");
}

export function headerLoginControlClass() {
  return [
    "inline-flex size-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full sm:size-5",
    "border border-[rgba(26,27,46,0.22)] bg-transparent p-0 leading-none",
    "text-[#1A1B2E] opacity-[0.58] transition-[opacity,border-color] duration-150 ease-out",
    "hover:opacity-100 hover:border-[rgba(26,27,46,0.45)]",
    "focus-visible:outline focus-visible:outline-1",
    "focus-visible:outline-offset-2 focus-visible:outline-[rgba(26,27,46,0.28)]",
    "[&_svg]:!h-[15px] [&_svg]:!w-[15px] [&_svg]:shrink-0 sm:[&_svg]:!h-[11px] sm:[&_svg]:!w-[11px]",
  ].join(" ");
}

function useDelayedTooltip() {
  const tooltipId = useId();
  const [tipOpen, setTipOpen] = useState(false);
  const showTimerRef = useRef<number | null>(null);

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const showTip = useCallback(() => {
    clearShowTimer();
    showTimerRef.current = window.setTimeout(() => {
      setTipOpen(true);
    }, TOOLTIP_DELAY_MS);
  }, [clearShowTimer]);

  const hideTip = useCallback(() => {
    clearShowTimer();
    setTipOpen(false);
  }, [clearShowTimer]);

  /** Keyboard focus only — pointer clicks focus the control but should not open the tip. */
  const onFocus = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      if (event.currentTarget.matches(":focus-visible")) {
        showTip();
      }
    },
    [showTip]
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hideTip();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearShowTimer();
    };
  }, [clearShowTimer, hideTip]);

  return {
    tooltipId,
    tipOpen,
    showTip,
    hideTip,
    onFocus,
  };
}

function HeaderIconTooltip({
  id,
  open,
  label,
}: {
  id: string;
  open: boolean;
  label: string;
}) {
  if (!open) {
    return null;
  }

  return (
    <span
      id={id}
      role="tooltip"
      className="pointer-events-none absolute top-[calc(100%+0.45rem)] left-1/2 z-20 -translate-x-1/2 rounded-md bg-[#1A1B2E] px-2 py-1 text-[11px] font-normal whitespace-nowrap text-white"
    >
      {label}
    </span>
  );
}

type HeaderIconButtonProps = {
  label: string;
  active?: boolean;
  showLabel?: boolean;
  /** Full Tailwind classes for progressive label collapse (must be complete literals for Tailwind scan) */
  labelClassName?: string;
  /** Active icon underline while the label is collapsed */
  iconActiveClassName?: string;
  onClick?: () => void;
  onMouseDown?: MouseEventHandler<HTMLButtonElement>;
  buttonRef?: Ref<HTMLButtonElement>;
  children: ReactNode;
  "data-testid"?: string;
};

export function HeaderIconButton({
  label,
  active,
  showLabel = true,
  labelClassName,
  iconActiveClassName,
  onClick,
  onMouseDown,
  buttonRef,
  children,
  "data-testid": testId,
}: HeaderIconButtonProps) {
  const { tooltipId, tipOpen, showTip, hideTip, onFocus } = useDelayedTooltip();
  const isLoginIcon = !showLabel;

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-pressed={typeof active === "boolean" ? active : undefined}
        aria-describedby={tipOpen ? tooltipId : undefined}
        onClick={() => {
          hideTip();
          onClick?.();
        }}
        onPointerDown={hideTip}
        onMouseDown={onMouseDown}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocus={onFocus}
        onBlur={hideTip}
        className={
          isLoginIcon
            ? headerLoginControlClass()
            : `${headerIconControlClass()} ${
                active ? "opacity-100" : "opacity-[0.58] hover:opacity-100"
              }`
        }
        data-testid={testId}
      >
        {isLoginIcon ? (
          children
        ) : (
          <span
            className={headerNavIconWrapClass(
              Boolean(active),
              iconActiveClassName
            )}
          >
            {children}
          </span>
        )}
        {showLabel ? (
          <span
            aria-hidden="true"
            className={headerNavLabelClass(Boolean(active), labelClassName)}
          >
            {label}
          </span>
        ) : null}
      </button>
      <HeaderIconTooltip id={tooltipId} open={tipOpen} label={label} />
    </span>
  );
}

type HeaderIconLinkProps = {
  label: string;
  href: string;
  showLabel?: boolean;
  children: ReactNode;
  "data-testid"?: string;
};

export function HeaderIconLink({
  label,
  href,
  showLabel = true,
  children,
  "data-testid": testId,
}: HeaderIconLinkProps) {
  const { tooltipId, tipOpen, showTip, hideTip, onFocus } = useDelayedTooltip();
  const isLoginIcon = !showLabel;

  return (
    <span className="relative inline-flex items-center">
      <Link
        href={href}
        aria-label={label}
        aria-describedby={tipOpen ? tooltipId : undefined}
        onClick={hideTip}
        onPointerDown={hideTip}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocus={onFocus}
        onBlur={hideTip}
        className={
          isLoginIcon
            ? headerLoginControlClass()
            : `${headerIconControlClass()} opacity-[0.58] hover:opacity-100`
        }
        data-testid={testId}
      >
        {children}
        {showLabel ? (
          <span aria-hidden="true" className={headerNavLabelClass(false)}>
            {label}
          </span>
        ) : null}
      </Link>
      <HeaderIconTooltip id={tooltipId} open={tipOpen} label={label} />
    </span>
  );
}
