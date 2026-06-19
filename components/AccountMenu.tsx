"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

type AccountMenuProps = {
  email: string;
  profileName: string | null;
};

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

export default function AccountMenu({ email, profileName }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

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

  const initials = getInitials(profileName, email);
  const displayName = profileName?.trim() || "Account";

  return (
    <div className="relative shrink-0" ref={menuRef} data-testid="auth-status">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200/80 bg-white text-xs font-medium tracking-wide text-gray-600 shadow-sm transition hover:border-gray-300 hover:text-gray-900"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label="Account menu"
        data-testid="account-menu-trigger"
      >
        {initials}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
          data-testid="account-menu-dropdown"
        >
          <div className="border-b border-gray-100 px-4 py-3">
            <p
              className="truncate text-sm font-medium text-gray-900"
              data-testid="auth-profile-name"
            >
              {displayName}
            </p>
            <p className="truncate text-xs text-gray-500" data-testid="auth-email">
              {email}
            </p>
            {!profileName ? (
              <p className="mt-1 text-xs text-gray-400" data-testid="auth-no-profile">
                No guide linked
              </p>
            ) : null}
          </div>

          <div className="py-1">
            <Link
              href="/my-profile"
              role="menuitem"
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setOpen(false)}
            >
              My guide
            </Link>
            <form action="/auth/logout" method="post" role="none">
              <button
                type="submit"
                role="menuitem"
                className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                data-testid="auth-logout"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
