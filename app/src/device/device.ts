/**
 * The app's view of its own build and device, and the native calls behind
 * Teacher tools, through src/native/NativeTutorDevice.ts. Where the native
 * module is absent (Jest, or a build installed before it existed) the
 * constants fall back to the development build's values and the calls
 * report that they are unavailable, so nothing above this file branches on
 * the platform.
 */

import Native, { type InstallResult } from '../native/NativeTutorDevice';
import { APP_ID, DEFAULT_MODEL_PATH, MODEL_FILE } from '../guidance/config';

export type { InstallResult };

export type DeviceInfo = {
  versionName: string;
  versionCode: number;
  buildType: string;
  applicationId: string;
  gitCommit: string;
  filesDir: string;
  /** True in the pilot (release) build: developer tools are behind the teacher PIN only. */
  pilot: boolean;
  sdkInt: number;
  deviceModel: string;
  /** Random, made once per installation; names this tablet in shared progress. */
  installId: string;
};

const FALLBACK: DeviceInfo = {
  versionName: 'development',
  versionCode: 0,
  buildType: 'unknown',
  applicationId: APP_ID,
  gitCommit: 'unknown',
  filesDir: `/data/data/${APP_ID}/files`,
  pilot: false,
  sdkInt: 0,
  deviceModel: 'unknown',
  installId: 'development',
};

export const nativeAvailable = Native != null;

let info: DeviceInfo | null = null;

export function deviceInfo(): DeviceInfo {
  if (!info) {
    info = Native ? { ...FALLBACK, ...Native.getConstants() } : FALLBACK;
  }
  return info;
}

/** Where the model is read from: the app's own files directory. */
export function modelPath(): string {
  return Native ? `${deviceInfo().filesDir}/models/${MODEL_FILE}` : DEFAULT_MODEL_PATH;
}

export type ModelFileInfo = { exists: boolean; bytes: number; verifiedSha256: string };

export function modelFileInfo(): ModelFileInfo {
  return Native ? Native.modelFileInfo(MODEL_FILE) : { exists: false, bytes: 0, verifiedSha256: '' };
}

export function pickAndInstallModel(expectedSha256: string, expectedBytes: number): Promise<InstallResult> {
  if (!Native) {
    return Promise.resolve({ ok: false, reason: 'Model installation needs the pilot build of the app.', sha256: '', bytes: 0 });
  }
  return Native.pickAndInstallModel(MODEL_FILE, expectedSha256, expectedBytes);
}

export type InstallProgress = { phase: string; copied: number; total: number };

export function installProgress(): InstallProgress {
  return Native ? Native.installProgress() : { phase: 'idle', copied: 0, total: -1 };
}

export function cancelModelInstall(): void {
  Native?.cancelModelInstall();
}

export function writeDownload(folder: string, fileName: string, mimeType: string, content: string): Promise<string> {
  if (!Native) {
    return Promise.reject(new Error('Exporting needs the pilot build of the app.'));
  }
  return Native.writeDownload(folder, fileName, mimeType, content);
}

export function freeBytes(): number | null {
  return Native ? Native.freeBytes() : null;
}

/** A short name a teacher can write on the tablet, such as "Tablet 7F3A". */
export function tabletLabel(installId: string = deviceInfo().installId): string {
  const hex = installId.replace(/[^0-9a-fA-F]/g, '');
  return hex.length >= 4 ? `Tablet ${hex.slice(0, 4).toUpperCase()}` : `Tablet ${installId}`;
}

export function shareText(fileName: string, mimeType: string, content: string, title: string): Promise<boolean> {
  if (!Native) {
    return Promise.reject(new Error('Sharing needs the pilot build of the app.'));
  }
  return Native.shareText(fileName, mimeType, content, title);
}

export type PickedFile = { name: string; content: string; error: string };

export function pickTextFiles(maxBytes: number): Promise<PickedFile[]> {
  if (!Native) {
    return Promise.reject(new Error('Importing needs the pilot build of the app.'));
  }
  return Native.pickTextFiles(maxBytes);
}

