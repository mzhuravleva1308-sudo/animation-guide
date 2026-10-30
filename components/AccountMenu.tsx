"use client";

import Link from "next/link";
import {
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { LogIn, UserRound } from "lucide-react";
import {
  HEADER_LOGIN_ICON,
  headerLoginControlClass,
} from "@/components/HeaderIconControl";
import { FESTIVALS_INDEX_PATH } from "@/lib/festivals/public-festival-paths.mjs";
import { GUIDES_INDEX_PATH } from "@/lib/guides/public-guide-links.mjs";

type AccountMenuAuthenticatedProps = {
  email: string;
  profileName: string | null;
};

type AccountMenuGuestProps = {
  email?: undefined;
  profileName?: undefined;
  /** Opens the in-page auth modal when set. */
  onLogin?: () => void;
  /** Used when there is no in-page modal (falls back to /login). */
  loginHref?: string;
  triggerRef?: Ref<HTMLButtonElement | null>;
};

type AccountMenuProps = AccountMenuAuthenticatedProps | AccountMenuGuestProps;

const MENU_ITEM_CLASS =
  "block w-full px-3 py-1.5 text-left text-[13px] leading-snug text-gray-700 hover:bg-gray-50";

const MENU_ACTION_ITEM_CLASS =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] font-medium leading-snug text-gray-900 hover:bg-gray-50";

function getInitials(profileName: string | null, email: string): string {
  if (profileName?.trim()) {
    const parts = profileName.trim().split(/\s+/);

    if (parts.length >= 2) {
      return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
    }

    return profileName.trim().slice(0, 2).toUpperCase();
  }

  return email.slice(0, 2).toUpperCase();
}

function isAuthenticatedProps(
  props: AccountMenuProps
): props is AccountMenuAuthenticatedProps {
  return typeof props.email === "string";
}

export default function AccountMenu(props: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const authenticated = isAuthenticatedProps(props);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const initials = authenticated
    ? getInitials(props.profileName, props.email)
    : null;
  const displayName = authenticated
    ? props.profileName?.trim() || "Account"
    : null;
  const loginHref =
    !authenticated && !props.onLogin ? (props.loginHref ?? "/login") : null;

  return (
    <div
      className={`relative shrink-0 ${open ? "z-[60]" : ""}`}
      ref={menuRef}
      data-testid="auth-status"
    >
      {authenticated ? (
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-[#B1A9D9]/70 bg-white text-[11px] font-semibold leading-none tracking-wide text-[#1A1B2E] transition hover:border-[#1A1B2E]/40 hover:text-[#1A1B2E] sm:size-5 sm:text-[8px]"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
          aria-label="Account menu"
          data-testid="account-menu-trigger"
        >
          {initials}
        </button>
      ) : (
        <button
          ref={props.triggerRef}
          type="button"
          onClick={() => setOpen((current) => !current)}
          className={headerLoginControlClass()}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
          aria-label="Account menu"
          data-testid="account-menu-trigger"
        >
          <UserRound
            size={HEADER_LOGIN_ICON.size}
            strokeWidth={HEADER_LOGIN_ICON.strokeWidth}
            fill="none"
            className="shrink-0"
            aria-hidden="true"
          />
        </button>
      )}

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-[60] mt-1.5 w-44 rounded-lg border border-gray-200 bg-white py-0.5 shadow-lg"
          data-testid="account-menu-dropdown"
        >
          {authenticated ? (
            <div className="border-b border-gray-100 px-3 py-2">
              <p
                className="truncate text-[13px] font-medium leading-snug text-gray-900"
                data-testid="auth-profile-name"
              >
                {displayName}
              </p>
              <p
                className="truncate text-[11px] leading-snug text-gray-500"
                data-testid="auth-email"
              >
                {props.email}
              </p>
              {!props.profileName ? (
                <p
                  className="mt-0.5 text-[11px] leading-snug text-gray-400"
                  data-testid="auth-no-profile"
                >
                  No guide linked
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="py-0.5">
            <Link
              href={GUIDES_INDEX_PATH}
              role="menuitem"
              className={MENU_ITEM_CLASS}
              data-testid="account-menu-guides"
              onClick={() => setOpen(false)}
            >
              Guides
            </Link>
            <Link
              href={FESTIVALS_INDEX_PATH}
              role="menuitem"
              className={MENU_ITEM_CLASS}
              data-testid="account-menu-festivals"
              onClick={() => setOpen(false)}
            >
              Festivals
            </Link>
          </div>

          {authenticated ? (
            <div className="border-t border-gray-100 py-0.5">
              <form action="/auth/logout" method="post" role="none">
                <button
                  type="submit"
                  role="menuitem"
                  className={MENU_ITEM_CLASS}
                  data-testid="auth-logout"
                >
                  Log out
                </button>
              </form>
            </div>
          ) : (
            <div className="border-t border-gray-100 py-0.5">
              {props.onLogin ? (
                <button
                  type="button"
                  role="menuitem"
                  className={MENU_ACTION_ITEM_CLASS}
                  data-testid="account-menu-login"
                  onMouseDown={(event) => {
                    // Keep focus on the header trigger for modal restore.
                    event.preventDefault();
                  }}
                  onClick={() => {
                    setOpen(false);
                    props.onLogin?.();
                  }}
                >
                  <LogIn
                    size={14}
                    strokeWidth={1.75}
                    className="shrink-0 opacity-70"
                    aria-hidden="true"
                  />
                  Log in
                </button>
              ) : (
                <Link
                  href={loginHref ?? "/login"}
                  role="menuitem"
                  className={MENU_ACTION_ITEM_CLASS}
                  data-testid="account-menu-login"
                  onClick={() => setOpen(false)}
                >
                  <LogIn
                    size={14}
                    strokeWidth={1.75}
                    className="shrink-0 opacity-70"
                    aria-hidden="true"
                  />
                  Log in
                </Link>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
