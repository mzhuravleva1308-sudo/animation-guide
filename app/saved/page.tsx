import { permanentRedirect } from "next/navigation";

// /saved is no longer a user-facing route. Saved is a tab on /.
export default function SavedPage() {
  permanentRedirect("/");
}
