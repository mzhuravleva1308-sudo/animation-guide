"use client";

import { useState } from "react";
import EmailMagicLinkAuthForm from "@/components/EmailMagicLinkAuthForm";
import { createClient } from "@/lib/supabase/client";
import { getAuthCallbackUrl } from "@/lib/auth/callback-url";
import { resolveAuthOrigin } from "@/lib/auth/callback-origin";
import {
  getOAuthSignInLabel,
  type OAuthProvider,
} from "@/lib/auth/oauth-providers";
import { POST_AUTH_PATH } from "@/lib/auth/post-auth-path";

type LoginScreenProps = {
  oauthProviders: OAuthProvider[];
};

type LoadingAction = OAuthProvider | null;

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
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<LoadingAction>(null);

  function getAuthRedirectUrl() {
    const authOrigin = resolveAuthOrigin(
      window.location.origin,
      process.env.NEXT_PUBLIC_SITE_URL
    );

    return getAuthCallbackUrl(authOrigin);
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
        aria-labelledby="login-email-link-heading"
        className="rounded-lg border border-gray-200 bg-white p-4"
      >
        <h2
          id="login-email-link-heading"
          className="text-sm font-medium text-gray-900"
        >
          Email link
        </h2>
        <EmailMagicLinkAuthForm
          testIdPrefix="login"
          postAuthPath={POST_AUTH_PATH}
        />
      </section>

      {message ? (
        <p className="text-sm text-gray-600" data-testid="login-message" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
