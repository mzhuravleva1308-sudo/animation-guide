export type AuthProfileProvisionResponse =
  | {
      ok: true;
      profile: {
        id: string;
        slug: string;
        share_token: string;
      };
    }
  | {
      ok: false;
      auth_error: string;
      message: string;
    };

export async function provisionAuthProfile(): Promise<AuthProfileProvisionResponse> {
  const response = await fetch("/auth/provision", {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
  });

  const payload = (await response.json()) as AuthProfileProvisionResponse;

  if (!response.ok && payload.ok) {
    return {
      ok: false,
      auth_error: "profile_provision_failed",
      message: "We signed you in, but couldn't set up your personal guide.",
    };
  }

  return payload;
}
