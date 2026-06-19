"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getAuthCallbackUrl } from "@/lib/auth/callback-url";
import { resolveAuthOrigin } from "@/lib/auth/callback-origin";
import {
  getOAuthSignInLabel,
  type OAuthProvider,
} from "@/lib/auth/oauth-providers";

type LoginScreenProps = {
  oauthProviders: OAuthProvider[];
};

type EmailMode = "password" | "magic-link";

type LoadingAction =
  | "magic-link"
  | "sign-in"
  | "sign-up"
  | OAuthProvider
  | null;

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-gray-500">
      <div className="h-px flex-1 bg-gray-200" />
      <span>{label}</span>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

function oauthButtonClassName(provider: OAuthProvider): string {
  const base =
    "w-full rounded-md px-4 py-2.5 text-sm font-medium disabled:opacity-60";

  if (provider === "apple") {
    return `${base} bg-gray-900 text-white hover:bg-gray-800`;
  }

  return `${base} border border-gray-300 bg-white text-gray-900 hover:bg-gray-50`;
}

export default function LoginScreen({ oauthProviders }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailMode, setEmailMode] = useState<EmailMode>("password");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<LoadingAction>(null);

  function getAuthRedirectUrl() {
    const authOrigin = resolveAuthOrigin(
      window.location.origin,
      process.env.NEXT_PUBLIC_SITE_URL
    );

    return getAuthCallbackUrl(authOrigin);
  }

  async function handleMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("magic-link");
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
      },
    });

    setMessage(
      error ? error.message : "Check your email for the sign-in link."
    );
    setLoading(null);
  }

  async function handlePasswordSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim()) {
      setMessage("Enter your email address.");
      return;
    }

    setLoading("sign-in");
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(null);
      return;
    }

    window.location.assign("/");
  }

  async function handlePasswordSignUp() {
    if (!email.trim()) {
      setMessage("Enter your email address.");
      return;
    }

    if (!password) {
      setMessage("Enter a password to create your account.");
      return;
    }

    setLoading("sign-up");
    setMessage(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(null);
      return;
    }

    if (data.session) {
      window.location.assign("/");
      return;
    }

    setMessage("Check your email to confirm your account.");
    setLoading(null);
  }

  async function handleOAuthSignIn(provider: OAuthProvider) {
    setLoading(provider);
    setMessage(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: getAuthRedirectUrl(),
      },
    });

    if (error) {
      setMessage(error.message);
      setLoading(null);
      return;
    }

    if (data.url) {
      window.location.assign(data.url);
      return;
    }

    setMessage("Could not start provider sign-in.");
    setLoading(null);
  }

  const isBusy = loading !== null;
  const isPasswordMode = emailMode === "password";

  return (
    <div className="mt-8 space-y-6">
      {oauthProviders.length > 0 ? (
        <section aria-label="Social sign-in" className="space-y-3">
          {oauthProviders.map((provider) => (
            <button
              key={provider}
              type="button"
              disabled={isBusy}
              onClick={() => handleOAuthSignIn(provider)}
              className={oauthButtonClassName(provider)}
              data-testid={`oauth-${provider}`}
            >
              {loading === provider
                ? `Connecting to ${getOAuthSignInLabel(provider).replace("Sign in with ", "")}...`
                : getOAuthSignInLabel(provider)}
            </button>
          ))}
        </section>
      ) : null}

      {oauthProviders.length > 0 ? (
        <SectionDivider label="or continue with email" />
      ) : null}

      <section
        aria-labelledby="login-email-heading"
        className="rounded-lg border border-gray-200 bg-white p-4"
      >
        <h2 id="login-email-heading" className="text-sm font-medium text-gray-900">
          Email sign-in
        </h2>

        {isPasswordMode ? (
          <form className="mt-4 space-y-3" onSubmit={handlePasswordSignIn}>
            <div>
              <label htmlFor="login-email" className="sr-only">
                Email
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Email address"
                data-testid="login-email"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="sr-only">
                Password
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Password"
                data-testid="login-password"
              />
            </div>
            <button
              type="submit"
              disabled={isBusy}
              className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading === "sign-in" ? "Signing in..." : "Sign in"}
            </button>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  setEmailMode("magic-link");
                  setMessage(null);
                }}
                className="text-gray-600 hover:text-gray-900 disabled:opacity-60"
                data-testid="login-use-magic-link"
              >
                Email me a sign-in link
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void handlePasswordSignUp()}
                className="text-gray-600 hover:text-gray-900 disabled:opacity-60"
                data-testid="login-create-account"
              >
                {loading === "sign-up" ? "Creating account..." : "Create account"}
              </button>
            </div>
          </form>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={handleMagicLink}>
            <div>
              <label htmlFor="login-email" className="sr-only">
                Email
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Email address"
                data-testid="login-email"
              />
            </div>
            <button
              type="submit"
              disabled={isBusy}
              className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading === "magic-link" ? "Sending link..." : "Send sign-in link"}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setEmailMode("password");
                setMessage(null);
              }}
              className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-60"
              data-testid="login-use-password"
            >
              Sign in with password instead
            </button>
          </form>
        )}
      </section>

      {message ? (
        <p className="text-sm text-gray-600" data-testid="login-message" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
