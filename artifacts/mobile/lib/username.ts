// Single source of truth for username rules. Both signup and Settings write
// usernames, and they used to disagree: signup normalized + checked
// availability, Settings wrote whatever was typed. Usernames are compared
// case-insensitively in the database, so they are stored lowercase.

export const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

export const USERNAME_RULE_HINT =
  "3-20 characters: lowercase letters, numbers, underscores";

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(normalized: string): boolean {
  return USERNAME_REGEX.test(normalized);
}
