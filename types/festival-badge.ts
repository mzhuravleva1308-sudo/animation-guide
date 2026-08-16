export type FestivalBadgeId =
  | "annecy"
  | "cannes"
  | "tiff"
  | "berlinale"
  | "sundance"
  | "venice"
  | "locarno"
  | "busan"
  | "bfi_london"
  | "san_sebastian"
  | "melbourne"
  | "sydney"
  | "mar_del_plata"
  | "tokyo_anime";

export type FestivalBadge = {
  id: FestivalBadgeId;
  label: string;
  fullName: string;
  description: string;
  color: string;
  backgroundColor: string;
};
