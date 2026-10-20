/**
 * The app's own native module (android/app/src/main/java/rw/offlinetutor/
 * device/TutorDeviceModule.kt): build identity, installing the tutor model
 * from a file the teacher picks, and writing research exports to Downloads.
 * Codegen reads this file; keep it to types the codegen accepts.
 *
 * Use it through src/device/device.ts, which falls back to safe defaults
 * where the module is absent (tests, an older installed build).
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type InstallResult = {
  ok: boolean;
  /** Plain words for the screen when ok is false; 'cancelled' when cancelled. */
  reason: string;
  sha256: string;
  bytes: number;
};

export interface Spec extends TurboModule {
  getConstants(): {
    versionName: string;
    versionCode: number;
    buildType: string;
    applicationId: string;
    gitCommit: string;
    filesDir: string;
    pilot: boolean;
    sdkInt: number;
    deviceModel: string;
    /** A random identity made once per installation; names this tablet in shared progress. */
    installId: string;
  };
  /**
   * Open the system file picker, copy the chosen file into the app's
   * models directory as `fileName` and check its size and SHA-256. The old
   * file is replaced only when the new one checks out.
   */
  pickAndInstallModel(fileName: string, expectedSha256: string, expectedBytes: number): Promise<InstallResult>;
  /** Progress of the running installation; phase is idle, picking, copying or done. */
  installProgress(): { phase: string; copied: number; total: number };
  cancelModelInstall(): void;
  /** The installed model file and the SHA-256 recorded when it was installed and checked. */
  modelFileInfo(fileName: string): { exists: boolean; bytes: number; verifiedSha256: string };
  /** Write a UTF-8 text file to Download/<folder>/; resolves the path shown to the teacher. */
  writeDownload(folder: string, fileName: string, mimeType: string, content: string): Promise<string>;
  freeBytes(): number;
  /**
   * Offer a text file through Android's share menu (Bluetooth, Quick Share
   * and the other apps the tablet has). Resolves false when the app is not
   * in the foreground.
   */
  shareText(fileName: string, mimeType: string, content: string, title: string): Promise<boolean>;
  /**
   * Let the teacher pick one or more files and read each as UTF-8, up to
   * maxBytes; a file that cannot be read comes back with `error` set.
   */
  pickTextFiles(maxBytes: number): Promise<Array<{ name: string; content: string; error: string }>>;
}

export default TurboModuleRegistry.get<Spec>('TutorDevice');
