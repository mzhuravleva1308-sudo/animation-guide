export { denyAdminApiAccess } from "./admin-api-denial.mjs";

export type AdminApiDenial = {
  status: 401 | 404;
  error: string;
};
