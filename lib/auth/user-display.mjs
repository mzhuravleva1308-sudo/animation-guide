/**
 * @param {{ email?: string | null, identities?: Array<{ identity_data?: { email?: string } }> }} user
 * @returns {string}
 */
export function getUserDisplayEmail(user) {
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
