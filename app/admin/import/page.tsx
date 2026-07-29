import { AdminFilmImportDisabled } from "@/components/AdminFilmImportDisabled";
import { notFound, redirect } from "next/navigation";
import { getAdminAccessStatus } from "@/lib/auth/require-admin";

export default async function ImportFilmPage() {
  const access = await getAdminAccessStatus();

  if (access === "unauthenticated") {
    redirect("/login");
  }

  if (access !== "admin") {
    notFound();
  }

  return <AdminFilmImportDisabled />;
}
