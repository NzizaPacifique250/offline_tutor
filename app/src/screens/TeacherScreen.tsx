/**
 * Teacher tools, behind the teacher PIN: install the tutor model from a
 * file, install lesson updates (online, or from a package file on an offline
 * tablet), export the learner records for the research, see the build and
 * content versions with the notices the app must carry, and open the
 * developer checks. Layout and wiring only; the rules live in
 * src/teacher/, src/export/ and src/device/.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import type { ContentVersion, LessonSummary } from '../content/service';
import {
  cancelModelInstall,
  deviceInfo,
  freeBytes,
  installProgress,
  modelFileInfo,
  pickAndInstallModel,
  pickTextFiles,
  shareText,
  tabletLabel,
  writeDownload,
  type InstallProgress,
} from '../device/device';
import { exportRecords } from '../export/records';
import { MODEL_BYTES, MODEL_FILE, MODEL_SHA256 } from '../guidance/config';
import type { GuidanceService } from '../guidance/service';
import type { Executor } from '../learner/store';
import { log } from '../log';
import { buildSummaryFile, saveReceived } from '../sharing/store';
import { MAX_SUMMARY_BYTES, parseSummary, summaryFileName } from '../sharing/summary';
import { installOutcomeText, megabytes, modelState, modelStatusText, NOTICES, pinMatches, progressText } from '../teacher/teacher';
import { describeRelease, type Release } from '../updates/releases';
import { KeyboardScrollView } from './KeyboardScrollView';
import type { InstallSummary } from './UpdatePrompt';
import { Badge, Button, Card, colors, ui } from './ui';

export function TeacherScreen({
  db,
  guidance,
  versions,
  lessons,
  unlocked,
  onUnlock,
  onClass,
  onDeveloper,
  updates,
  onCheckUpdates,
  onInstallUpdates,
  onImportLessonFiles,
}: {
  db: Executor;
  guidance: GuidanceService;
  versions: ContentVersion[];
  lessons: LessonSummary[];
  /** Kept by the app while the teacher moves between teacher screens. */
  unlocked: boolean;
  onUnlock: () => void;
  onClass: () => void;
  onDeveloper: () => void;
  /** Lesson updates published for this tablet and not yet installed. */
  updates: Release[];
  onCheckUpdates: () => Promise<string>;
  onInstallUpdates: () => Promise<InstallSummary>;
  onImportLessonFiles: () => Promise<string>;
}): React.JSX.Element {
  const [pin, setPin] = useState('');
  const [pinWrong, setPinWrong] = useState(false);
  const [model, setModel] = useState(modelFileInfo);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [installNote, setInstallNote] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [lessonBusy, setLessonBusy] = useState(false);
  const [lessonNote, setLessonNote] = useState<string | null>(null);
  const lessonAction = useCallback(async (run: () => Promise<string>) => {
    setLessonBusy(true);
    setLessonNote(null);
    try {
      setLessonNote(await run());
    } catch (e) {
      setLessonNote(`That did not work: ${(e as Error).message}`);
    } finally {
      setLessonBusy(false);
    }
  }, []);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) {
        clearInterval(timer.current);
      }
    },
    [],
  );

  const unlock = useCallback(() => {
    if (pinMatches(pin)) {
      onUnlock();
      setPinWrong(false);
      log('teacher', 'teacher tools opened');
    } else {
      setPinWrong(true);
    }
    setPin('');
  }, [onUnlock, pin]);

  const install = useCallback(async () => {
    if (guidance.state === 'busy' || guidance.state === 'loading') {
      setInstallNote('The tutor is working on a request. Wait for it to finish, then install.');
      return;
    }
    setInstallNote(null);
    setInstalling(true);
    // The old file is memory-mapped while the model is loaded; close it first.
    await guidance.release();
    timer.current = setInterval(() => setProgress(installProgress()), 500);
    try {
      const r = await pickAndInstallModel(MODEL_SHA256, MODEL_BYTES);
      log('teacher', r.ok ? `model installed and checked: ${r.bytes} bytes, sha256 ${r.sha256}` : `model not installed: ${r.reason}`);
      setInstallNote(installOutcomeText(r));
    } finally {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
      setProgress(null);
      setInstalling(false);
      setModel(modelFileInfo());
    }
  }, [guidance]);

  const doExport = useCallback(async () => {
    setExporting(true);
    setExportNote(null);
    try {
      const meta = {
        app: deviceInfo(),
        content: versions,
        model: { file: MODEL_FILE, expectedSha256: MODEL_SHA256, ...modelFileInfo() },
      };
      const r = await exportRecords(db, (folder, name, mime, content) => writeDownload(`OfflineTutor/${folder}`, name, mime, content), meta);
      const tables = r.files.filter(f => f.name.endsWith('.csv')).map(f => `${f.name} (${f.rows})`);
      log('teacher', `export ${r.folder}: ${tables.join(', ')}`);
      setExportNote(`Saved to Download/OfflineTutor/${r.folder}: ${tables.join(', ')} and manifest.json. Copy the folder to a computer by USB.`);
    } catch (e) {
      log('teacher', `export failed: ${(e as Error).message}`);
      setExportNote(`Export failed: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }, [db, versions]);

  const summaryFile = useCallback(async () => {
    const info = deviceInfo();
    const tablet = { id: info.installId, label: tabletLabel(info.installId), deviceModel: info.deviceModel, appVersion: info.versionName };
    const now = new Date();
    const file = await buildSummaryFile(db, lessons, versions, tablet, now);
    return { name: summaryFileName(tablet.label, now), content: JSON.stringify(file), learners: file.learners.length };
  }, [db, lessons, versions]);

  const share = useCallback(
    async (how: 'send' | 'save') => {
      setSharing(true);
      setShareNote(null);
      try {
        const f = await summaryFile();
        if (how === 'send') {
          const opened = await shareText(f.name, 'text/plain', f.content, "Send progress to the teacher's tablet");
          setShareNote(
            opened
              ? `Choose Bluetooth or Quick Share, then the teacher's tablet. The file holds ${f.learners} learner${f.learners === 1 ? '' : 's'}.`
              : 'The share menu could not be opened.',
          );
        } else {
          const path = await writeDownload('OfflineTutor', f.name, 'text/plain', f.content);
          setShareNote(`Saved ${path} (${f.learners} learner${f.learners === 1 ? '' : 's'}). Copy it to the teacher's tablet by cable or memory card.`);
        }
        log('teacher', `progress summary ${how}: ${f.name}, ${f.learners} learners`);
      } catch (e) {
        setShareNote(`Not shared: ${(e as Error).message}`);
      } finally {
        setSharing(false);
      }
    },
    [summaryFile],
  );

  const collect = useCallback(async () => {
    setImporting(true);
    setImportNote(null);
    try {
      const files = await pickTextFiles(MAX_SUMMARY_BYTES);
      if (files.length === 0) {
        setImportNote('No file was chosen.');
        return;
      }
      const lines: string[] = [];
      for (const f of files) {
        if (f.error) {
          lines.push(`${f.name}: ${f.error}`);
          continue;
        }
        const parsed = parseSummary(f.content);
        if (!parsed.ok) {
          lines.push(`${f.name}: ${parsed.reason}.`);
          continue;
        }
        const s = parsed.summary;
        const outcome = await saveReceived(db, s, deviceInfo().installId);
        const n = `${s.learners.length} learner${s.learners.length === 1 ? '' : 's'}`;
        lines.push(
          {
            added: `${s.tablet.label}: ${n} added.`,
            updated: `${s.tablet.label}: updated to the newer file, ${n}.`,
            same: `${s.tablet.label}: already imported.`,
            older: `${s.tablet.label}: older than the file already imported; kept the newer one.`,
            own: `${s.tablet.label}: this is this tablet's own file; its learners are already here.`,
          }[outcome],
        );
      }
      log('teacher', `progress import: ${lines.join(' | ')}`);
      setImportNote(lines.join('\n'));
    } catch (e) {
      setImportNote(`Not imported: ${(e as Error).message}`);
    } finally {
      setImporting(false);
    }
  }, [db]);

  if (!unlocked) {
    return (
      <KeyboardScrollView contentContainerStyle={ui.screen}>
        <Card>
          <Text style={ui.label}>Teacher tools</Text>
          <Text style={ui.muted}>For the teacher or researcher running the session. Enter the teacher PIN.</Text>
          <TextInput
            style={ui.input}
            value={pin}
            onChangeText={t => {
              setPin(t);
              setPinWrong(false);
            }}
            placeholder="Teacher PIN"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            onSubmitEditing={unlock}
            returnKeyType="done"
            testID="teacher-pin"
          />
          {pinWrong ? <Text style={[ui.muted, { color: colors.bad }]}>That PIN is not right.</Text> : null}
          <Button label="Open teacher tools" primary onPress={unlock} disabled={!pin.trim()} testID="teacher-unlock" />
        </Card>
      </KeyboardScrollView>
    );
  }

  const info = deviceInfo();
  const state = modelState(model);
  const free = freeBytes();

  return (
    <KeyboardScrollView contentContainerStyle={ui.screen}>
      <Card>
        <Text style={ui.label}>Class progress</Text>
        <Text style={ui.muted}>Every learner on this tablet and on the tablets that sent their progress, by unit, and who may need help. Works offline.</Text>
        <Button label="Open class progress" primary onPress={onClass} testID="teacher-class" />
      </Card>

      <Card>
        <Text style={ui.label}>Share this tablet's progress</Text>
        <Text style={ui.muted}>
          On a student tablet: send a summary of every learner on it ({tabletLabel()}) to the teacher's tablet. It holds learner codes and,
          per exercise, attempts, wrong answers, hints and whether it was solved; never answers or names. Switch Bluetooth on first; airplane
          mode can stay on.
        </Text>
        {shareNote ? (
          <Text style={ui.body} testID="teacher-share-note">
            {shareNote}
          </Text>
        ) : null}
        <View style={ui.row}>
          <Button label="Send by Bluetooth or Quick Share" primary onPress={() => share('send')} disabled={sharing} testID="teacher-share" />
          <Button label="Save to Download" onPress={() => share('save')} disabled={sharing} testID="teacher-share-save" />
        </View>
      </Card>

      <Card>
        <Text style={ui.label}>Collect progress from other tablets</Text>
        <Text style={ui.muted}>
          On the teacher's tablet: import the files the student tablets sent. Bluetooth saves them in Download, Quick Share in Download/Quick
          Share. Several can be chosen at once; importing a file twice changes nothing.
        </Text>
        {importNote ? (
          <Text style={ui.body} testID="teacher-import-note">
            {importNote}
          </Text>
        ) : null}
        <Button label={importing ? 'Importing…' : 'Import progress files'} primary onPress={() => collect()} disabled={importing} testID="teacher-import" />
      </Card>

      <Card>
        <View style={ui.row}>
          <Text style={[ui.label, ui.flex1]}>Lesson updates</Text>
          <Badge text={updates.length ? `${updates.length} ready` : 'none waiting'} tone={updates.length ? 'warn' : 'ok'} />
        </View>
        <Text style={ui.muted} testID="teacher-lessons-installed">
          Installed: {versions.map(v => `${v.unitTitle} ${v.version}`).join(', ') || 'none'}
        </Text>
        {updates.map(r => (
          <Text key={r.id} style={ui.body}>
            {describeRelease(r, versions.find(v => v.packageId === r.packageId)?.version)}
            {r.notes ? `. ${r.notes}` : ''}
          </Text>
        ))}
        <Text style={ui.muted}>
          With internet, the tablet looks for lessons published on the admin portal at start-up and every ten minutes, and offers them
          when no lesson is open. Without internet (or on the offline-only build), download the release file from the portal's Content
          page, copy it into Download and import it here. Only a newer version is installed, and saved progress is kept.
        </Text>
        {lessonNote ? (
          <Text style={ui.body} testID="teacher-lessons-note">
            {lessonNote}
          </Text>
        ) : null}
        {updates.length ? (
          <Button
            label={lessonBusy ? 'Installing…' : 'Install updates'}
            primary
            disabled={lessonBusy}
            onPress={() =>
              lessonAction(async () => {
                const s = await onInstallUpdates();
                return [...s.installed.map(l => `Installed: ${l}`), ...s.problems].join('\n') || 'Nothing to install.';
              })
            }
            testID="teacher-lessons-install"
          />
        ) : null}
        <View style={ui.row}>
          <Button label="Check for updates" disabled={lessonBusy} onPress={() => lessonAction(onCheckUpdates)} testID="teacher-lessons-check" />
          <Button label="Import lessons from a file" disabled={lessonBusy} onPress={() => lessonAction(onImportLessonFiles)} testID="teacher-lessons-import" />
        </View>
      </Card>

      <Card>
        <View style={ui.row}>
          <Text style={[ui.label, ui.flex1]}>Tutor model</Text>
          <Badge text={state === 'checked' ? 'ready' : state === 'unchecked' ? 'not checked' : 'not ready'} tone={state === 'checked' ? 'ok' : 'warn'} />
        </View>
        <Text style={ui.body} testID="teacher-model-status">
          {modelStatusText(model)}
        </Text>
        <Text style={ui.muted}>
          Copy the file {MODEL_FILE} ({megabytes(MODEL_BYTES)}) onto this tablet first, for example into Download by USB. Installing copies it into
          the app and checks its checksum; a file that does not match is refused and the current model is kept.
        </Text>
        {progress ? <Text style={ui.body}>{progressText(progress)}</Text> : null}
        {installNote ? (
          <Text style={ui.body} testID="teacher-install-note">
            {installNote}
          </Text>
        ) : null}
        {installing ? (
          <Button label="Cancel installation" danger onPress={cancelModelInstall} testID="teacher-install-cancel" />
        ) : (
          <Button label={state === 'missing' ? 'Install the tutor model from a file' : 'Install the model again from a file'} primary onPress={() => install().catch(e => setInstallNote((e as Error).message))} testID="teacher-install" />
        )}
      </Card>

      <Card>
        <Text style={ui.label}>Research records</Text>
        <Text style={ui.muted}>
          Saves the learner records (learner codes, sessions, answers, hints and solutions seen, tutor requests with timings) as CSV files in
          Download/OfflineTutor on this tablet. No names are stored, and nothing is sent anywhere.
        </Text>
        {exportNote ? (
          <Text style={ui.body} testID="teacher-export-note">
            {exportNote}
          </Text>
        ) : null}
        <Button label={exporting ? 'Exporting…' : 'Export records'} primary onPress={() => doExport()} disabled={exporting} testID="teacher-export" />
      </Card>

      <Card>
        <Text style={ui.label}>About this build</Text>
        <Text style={ui.body} testID="teacher-version">
          Offline Tutor {info.versionName} (build {info.versionCode}, {info.buildType}, commit {info.gitCommit})
        </Text>
        <Text style={ui.muted}>
          {info.applicationId} · {info.deviceModel} · Android API {info.sdkInt}
          {free !== null ? ` · ${megabytes(free)} free` : ''}
        </Text>
        <Text style={ui.muted}>Content: {versions.map(v => `${v.packageId} v${v.version}`).join(', ') || 'none'}</Text>
        {NOTICES.map(n => (
          <Text key={n.title} style={ui.muted}>
            <Text style={ui.bold}>{n.title}. </Text>
            {n.text}
          </Text>
        ))}
      </Card>

      <Card>
        <Text style={ui.label}>Developer checks</Text>
        <Text style={ui.muted}>Model loading and a test completion, for diagnosing the tutor on this tablet.</Text>
        <Button label="Open developer checks" onPress={onDeveloper} testID="teacher-dev" />
      </Card>
    </KeyboardScrollView>
  );
}
