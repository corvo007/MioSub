/**
 * Sentinel values returned by binary version detection when a real version
 * string is unavailable. Shared between systemInfoService and preflightCheck
 * to keep the list in sync.
 */
export const VERSION_SENTINELS = new Set(['not found', 'error', 'unknown', 'timeout']);

/** Check whether a version string is a real version (not a sentinel). */
export function isRealVersion(v: string | undefined): v is string {
  return !!v && !VERSION_SENTINELS.has(v.toLowerCase());
}

/** Matches a simple semver-like string: optional "v" prefix + dot-separated digits. */
const SEMVER_RE = /^v?\d+(\.\d+)*$/i;

/**
 * Compare two semver version strings (e.g. "0.2.0" vs "0.1.5").
 * Handles optional "v" prefix (e.g. "v0.2.0").
 *
 * @throws {Error} if either string is not a valid semver version.
 * @returns  1 if a > b, -1 if a < b, 0 if equal
 */
export function compareVersions(a: string, b: string): number {
  if (!SEMVER_RE.test(a)) throw new Error(`Invalid version string: "${a}"`);
  if (!SEMVER_RE.test(b)) throw new Error(`Invalid version string: "${b}"`);
  const parse = (v: string) => v.replace(/^v/i, '').split('.').map(Number);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}
