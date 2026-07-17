import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import {
  getProjectProfileCredentials,
  getProjectProfileId,
} from "./project-profile-credentials";

const PROJECT_RATING_AUTH_PASSWORD = "E2eRatingTestPassword1!";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} for E2E project profile auth.`);
  }

  return value;
}

function createServiceRoleClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

export function getProjectRatingAuthEmail(projectName: string): string {
  return `e2e-rating-${projectName}@example.test`;
}

async function findAuthUserByEmail(email: string) {
  const supabase = createServiceRoleClient();
  const normalizedEmail = email.trim().toLowerCase();

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    const match = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail
    );

    if (match) {
      return match;
    }

    if (data.users.length < 200) {
      break;
    }
  }

  return null;
}

export async function ensureProjectRatingAuthUser(
  projectName: string
): Promise<{ profileId: string; userId: string; email: string }> {
  const email = getProjectRatingAuthEmail(projectName);
  const credentials = getProjectProfileCredentials(projectName);
  const profileId = getProjectProfileId(projectName);
  const supabase = createServiceRoleClient();

  let user = await findAuthUserByEmail(email);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: PROJECT_RATING_AUTH_PASSWORD,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new Error(
        `Failed to create auth user for ${email}: ${error?.message ?? "unknown error"}`
      );
    }

    user = data.user;
  } else {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: PROJECT_RATING_AUTH_PASSWORD,
      email_confirm: true,
    });

    if (error) {
      throw new Error(
        `Failed to refresh auth password for ${email}: ${error.message}`
      );
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("slug", credentials.slug)
    .eq("share_token", credentials.token)
    .single();

  if (profileError || !profile) {
    throw new Error(
      `Failed to load project profile for auth link: ${profileError?.message ?? "not found"}`
    );
  }

  if (profile.id !== profileId) {
    throw new Error(
      `Project profile id mismatch for ${projectName}: expected ${profileId}, found ${profile.id}.`
    );
  }

  const { error: clearError } = await supabase
    .from("profiles")
    .update({ user_id: null })
    .eq("user_id", user.id);

  if (clearError) {
    throw new Error(`Failed to clear previous profile links: ${clearError.message}`);
  }

  const { error: linkError } = await supabase
    .from("profiles")
    .update({ user_id: user.id })
    .eq("id", profile.id);

  if (linkError) {
    throw new Error(`Failed to link auth user to project profile: ${linkError.message}`);
  }

  return { profileId: profile.id, userId: user.id, email };
}

export async function signInProjectRatingUser(
  page: Page,
  projectName: string
): Promise<void> {
  const email = getProjectRatingAuthEmail(projectName);

  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(PROJECT_RATING_AUTH_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("account-menu-trigger")).toBeVisible({
    timeout: 15_000,
  });
}
