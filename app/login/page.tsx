import Link from "next/link";
import LoginScreen from "@/components/LoginScreen";
import { resolveOAuthProviders } from "@/lib/auth/oauth-providers";
import { PRIVACY_PATH } from "@/lib/legal/privacy";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const oauthProviders = resolveOAuthProviders(
    process.env.NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS
  );

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-gray-600">
        Enter your email and we&apos;ll send you a sign-in link.
      </p>

      {error ? (
        <p className="mt-4 text-sm text-red-600" data-testid="login-error">
          {error}
        </p>
      ) : null}

      <LoginScreen oauthProviders={oauthProviders} />

      <p className="mt-8 text-sm text-gray-500">
        <Link
          href={PRIVACY_PATH}
          className="underline decoration-gray-300 underline-offset-2 hover:text-gray-800"
          data-testid="login-privacy-link"
        >
          Privacy Policy
        </Link>
      </p>
    </main>
  );
}
