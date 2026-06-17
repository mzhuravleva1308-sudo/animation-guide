type ProfilePageLoadLog = {
  slug: string;
  ratingsCount: number;
  likedHighRatedCount: number;
  isColdStartMode: boolean;
  filmsCount: number;
};

export function createProfilePageLoadTimer() {
  const startedAt = Date.now();

  return (details: ProfilePageLoadLog) => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    console.info("[profile-page] load", {
      ...details,
      supabaseMs: Date.now() - startedAt,
    });
  };
}
