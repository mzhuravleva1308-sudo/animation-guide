export type FestivalBadgeId =
  | "annecy"
  | "cannes"
  | "tiff"
  | "berlinale"
  | "sundance"
  | "tokyo_anime";

export type FestivalBadge = {
  id: FestivalBadgeId;
  label: string;
  fullName: string;
  description: string;
  color: string;
  backgroundColor: string;
};
