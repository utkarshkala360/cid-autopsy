// Plain constants/types only — no Mongoose import here. Client components
// need TEAM_ROLES at runtime (role <select> options); importing it from the
// Mongoose model file would pull the whole mongodb driver into the browser
// bundle.
export const TEAM_ROLES = ["viewer", "member", "admin"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
