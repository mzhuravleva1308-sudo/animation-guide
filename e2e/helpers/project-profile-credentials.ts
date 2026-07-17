import type { ProfileTestCredentials } from "./profile-credentials";

const PROJECT_E2E_PROFILES: Record<string, ProfileTestCredentials> = {
  chromium: {
    slug: "e2e-test-chromium",
    token: "local-e2e-chromium-token",
  },
  firefox: {
    slug: "e2e-test-firefox",
    token: "local-e2e-firefox-token",
  },
  webkit: {
    slug: "e2e-test-webkit",
    token: "local-e2e-webkit-token",
  },
  "mobile-chrome": {
    slug: "e2e-test-mobile-chrome",
    token: "local-e2e-mobile-chrome-token",
  },
  "mobile-safari": {
    slug: "e2e-test-mobile-safari",
    token: "local-e2e-mobile-safari-token",
  },
};

export function getProjectProfileCredentials(
  projectName: string
): ProfileTestCredentials {
  const credentials = PROJECT_E2E_PROFILES[projectName];

  if (!credentials) {
    throw new Error(
      `No cross-browser E2E profile configured for Playwright project "${projectName}".`
    );
  }

  return credentials;
}

const PROJECT_PROFILE_IDS: Record<string, string> = {
  chromium: "22222222-2222-4222-8222-222222222202",
  firefox: "22222222-2222-4222-8222-222222222203",
  webkit: "22222222-2222-4222-8222-222222222204",
  "mobile-chrome": "22222222-2222-4222-8222-222222222205",
  "mobile-safari": "22222222-2222-4222-8222-222222222206",
};

export function getProjectProfileId(projectName: string): string {
  const profileId = PROJECT_PROFILE_IDS[projectName];

  if (!profileId) {
    throw new Error(
      `No cross-browser E2E profile id configured for Playwright project "${projectName}".`
    );
  }

  return profileId;
}

export function isAllowedE2eProfileSlug(slug: string): boolean {
  return slug === "e2e-test" || slug.startsWith("e2e-test-");
}

export async function ensureProjectE2eProfile(
  projectName: string
): Promise<ProfileTestCredentials> {
  const credentials = getProjectProfileCredentials(projectName);
  const profileId = getProjectProfileId(projectName);

  const { createClient } = await import("@supabase/supabase-js");

  function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Missing ${name} for E2E profile setup.`);
    }

    return value;
  }

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const { error } = await supabase.from("profiles").upsert(
    {
      id: profileId,
      name: `E2E Test Profile (${projectName})`,
      slug: credentials.slug,
      share_token: credentials.token,
    },
    { onConflict: "slug" }
  );

  if (error) {
    throw new Error(
      `Failed to ensure E2E profile for ${projectName}: ${error.message}`
    );
  }

  return credentials;
}
