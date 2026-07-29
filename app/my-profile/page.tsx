import { permanentRedirect } from "next/navigation";

// /my-profile is no longer a user-facing route.
// Authenticated users see their profile state on /.
// No profile data or provisioning queries are executed before redirect.
export default function MyProfilePage() {
  permanentRedirect("/");
}
