/** 운영자 역할 */
export const PRIVILEGED_ROLES = [
  "master",
  "director",
  "technical_lead",
  "admin",
  "instructor",
];

export function isPrivilegedRole(role) {
  return role != null && PRIVILEGED_ROLES.includes(role);
}

export function canAccessCourse(role) {
  return ["instructor", "technical_lead", "director", "master", "admin", "student", "researcher"].includes(role || "");
}
