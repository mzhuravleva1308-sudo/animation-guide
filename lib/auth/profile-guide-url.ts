import {
  buildProfileGuidePath as buildProfileGuidePathImpl,
  buildProfileGuidePathFromProfile as buildProfileGuidePathFromProfileImpl,
} from "./profile-guide-url.mjs";

export function buildProfileGuidePath(slug: string, shareToken: string): string {
  return buildProfileGuidePathImpl(slug, shareToken);
}

export function buildProfileGuidePathFromProfile(profile: {
  slug: string;
  share_token: string;
}): string {
  return buildProfileGuidePathFromProfileImpl(profile);
}
