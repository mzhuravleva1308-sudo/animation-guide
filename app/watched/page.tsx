import { permanentRedirect } from "next/navigation";

// /watched is no longer a user-facing route. Watched is a tab on /.
export default function WatchedPage() {
  permanentRedirect("/");
}
