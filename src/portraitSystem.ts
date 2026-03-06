const PORTRAIT_ROLES = new Set(["boss", "wrangler", "point", "hand", "cook", "scout"]);

export function getPortraitStateForHealth(health: number): string {
  if (health > 75) return "healthy";
  if (health > 50) return "hurt";
  if (health > 25) return "wounded";
  return "critical";
}

export function isPortraitRole(roleId: string): boolean {
  return PORTRAIT_ROLES.has(roleId);
}
