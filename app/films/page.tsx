import { permanentRedirect } from "next/navigation";

// /films is no longer a user-facing route. The catalog lives at /.
// Query parameters are intentionally discarded to prevent token leakage.
export default function FilmsPage() {
  permanentRedirect("/");
}
