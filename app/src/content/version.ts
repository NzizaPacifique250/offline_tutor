/**
 * Package versions are major.minor.patch (tools/validate_package.py checks
 * the form), compared part by part as numbers, so 0.10.0 is newer than
 * 0.9.0. Pure.
 */

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) {
      return d < 0 ? -1 : 1;
    }
  }
  return 0;
}

/** True when `candidate` should replace `installed` (nothing installed counts as older). */
export function isNewer(candidate: string, installed: string | null | undefined): boolean {
  return installed == null || compareVersions(candidate, installed) > 0;
}
