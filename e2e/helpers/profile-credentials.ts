export type ProfileTestCredentials = {
  slug: string;
  token: string;
};

export function getProfileTestCredentials(): ProfileTestCredentials | null {
  const slug = process.env.E2E_PROFILE_SLUG;
  const token = process.env.E2E_PROFILE_TOKEN;

  if (!slug || !token) {
    return null;
  }

  return { slug, token };
}

export function requireProfileTestCredentials(): ProfileTestCredentials {
  const credentials = getProfileTestCredentials();

  if (!credentials) {
    throw new Error(
      "Missing E2E_PROFILE_SLUG and E2E_PROFILE_TOKEN (see ENV.md)."
    );
  }

  return credentials;
}

export function profilePagePath({ slug, token }: ProfileTestCredentials) {
  return `/p/${slug}?token=${encodeURIComponent(token)}`;
}
