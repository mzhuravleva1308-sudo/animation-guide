import type { User } from "@supabase/supabase-js";

export function getUserDisplayEmail(user: User): string {
  if (user.email) {
    return user.email;
  }

  for (const identity of user.identities ?? []) {
    const email = identity.identity_data?.email;
    if (typeof email === "string" && email.length > 0) {
      return email;
    }
  }

  return "Signed in";
}
