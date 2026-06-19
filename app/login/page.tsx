import LoginScreen from "@/components/LoginScreen";
import { resolveOAuthProviders } from "@/lib/auth/oauth-providers";

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
        Sign in with email and password, or request a magic link.
      </p>

      {error ? (
        <p className="mt-4 text-sm text-red-600" data-testid="login-error">
          {error}
        </p>
      ) : null}

      <LoginScreen oauthProviders={oauthProviders} />
    </main>
  );
}
