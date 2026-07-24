import { redirect } from "next/navigation";
import FilmsPageClient from "@/components/FilmsPageClient";
import { POST_AUTH_PATH } from "@/lib/auth/post-auth-path";
import { loadPublicFilmCatalog } from "@/lib/load-public-film-catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const catalog = await loadPublicFilmCatalog();

  if (catalog.auth?.profile) {
    redirect(POST_AUTH_PATH);
  }

  return (
    <FilmsPageClient
      auth={catalog.auth}
      films={catalog.films}
      awardWinningFilmIds={catalog.awardWinningFilmIds}
      pageSize={catalog.pageSize}
      loadError={catalog.loadError}
      postAuthPath={POST_AUTH_PATH}
    />
  );
}
