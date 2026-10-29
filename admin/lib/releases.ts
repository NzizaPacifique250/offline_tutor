import type { ContentRelease, Device } from "@/lib/types";

// Package versions are major.minor.patch, compared as numbers (0.10.0 is
// newer than 0.9.0), as the tablet compares them.
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

// A tablet's content line, as it sends it when it syncs:
// "rw-s6-am.u1 v0.2.0, rw-s6-am.u4 v0.1.0".
export function installedVersions(content: string): Map<string, string> {
  const versions = new Map<string, string>();
  for (const part of content.split(",")) {
    const [, id, version] = part.trim().match(/^(\S+) v(\d+\.\d+\.\d+)$/) ?? [];
    if (id && version) versions.set(id, version);
  }
  return versions;
}

export type ReleaseTablet = { device: Device; has: string | null; current: boolean };

// The tablets a release is for (all of them when it names none), each with
// the version of the unit it reported at its last sync.
export function releaseTablets(release: Pick<ContentRelease, "package_id" | "version" | "devices">, devices: Device[]): ReleaseTablet[] {
  const meant = release.devices.length ? devices.filter((d) => release.devices.includes(d.id)) : devices;
  return meant.map((device) => {
    const has = installedVersions(device.content).get(release.package_id) ?? null;
    return { device, has, current: has !== null && compareVersions(has, release.version) >= 0 };
  });
}
