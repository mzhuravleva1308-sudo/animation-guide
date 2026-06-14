import { Film } from "@/types/film";

export type TopPickCategory = "safe_choice" | "taste_hit" | "risky_discovery";

export type TopPick = {
  id: string;
  profile_id: string;
  film_id: string;
  category: TopPickCategory;
  rank: number;
  reason: string;
  created_at: string;
};

export type TopPickWithFilm = TopPick & {
  film: Film;
};

export const TOP_PICK_CATEGORY_ORDER: TopPickCategory[] = [
  "safe_choice",
  "taste_hit",
  "risky_discovery",
];

export const TOP_PICK_CATEGORY_LABELS: Record<TopPickCategory, string> = {
  safe_choice: "Safe choice",
  taste_hit: "Taste hit",
  risky_discovery: "Risky discovery",
};
