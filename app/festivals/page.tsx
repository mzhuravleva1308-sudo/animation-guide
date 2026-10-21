import { redirect } from "next/navigation";
import {
  CURRENT_FESTIVAL_YEAR,
  FESTIVALS_YEAR_PATH,
} from "@/lib/festivals/public-festival-paths.mjs";

export default function FestivalsIndexPage() {
  redirect(FESTIVALS_YEAR_PATH(CURRENT_FESTIVAL_YEAR));
}
