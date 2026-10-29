/**
 * Developer screen (P2 of docs/PROTOTYPE_DEVELOPMENT_PLAN.md), reached from
 * the foot of the topics screen. It is not the learner interface. It answers
 * the bridge questions on the real tablet and keeps the P2 and P3 regression
 * checks in one place:
 *
 *   1. Does the packaged native library load on this CPU at all?
 *   2. Can the model be opened from the app's private storage?
 *   3. What are time-to-first-token and total time for one bounded answer?
 *   4. Do cancellation and a second request behave?
 *   5. Do the storage record and the imported package survive a restart?
 *
 * Since P5 the model is opened through the shared guidance service, so the
 * developer screen and the study flow can never hold two copies of it.
 * Every step logs to the screen so the result can be read off the device.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { loadLlamaModelInfo } from 'llama.rn';
import type { Lesson } from '../lesson';
import { LessonView } from '../LessonView';
import { storageCheck } from '../storage';
import { getDb } from '../content/db';
import { importPackages } from '../content/importer';
import { PACKAGES } from '../content/packages';
import { routeQuestion } from '../content/router';
import { getContentVersions, getExamples, getExercises, getLesson, listLessons } from '../content/service';
import { toLesson } from '../content/toLesson';
import { N_CTX, N_GPU_LAYERS, N_PREDICT, N_THREADS } from '../guidance/config';
import type { GuidanceResult, GuidanceService, ServiceState } from '../guidance/service';
import { Button, colors, ui } from './ui';

// Free questions used to demonstrate the scope gate on screen: two in scope,
// two that must be declined without calling the model.
const ROUTER_DEMO = [
  'How do I multiply (3 + 4i) by (2 - i)?',
  'What is the conjugate of 12 - 4i?',
  'Find the equation of the tangent to the parabola y^2 = 8x at (2, 4).',
  'Explain the light-dependent reactions of photosynthesis.',
];

// A probe from bench/eval/s6_math_probe.jsonl so the answer can be checked.
const TEST_QUESTION = 'Simplify (3 + 2i)(1 - 4i), giving your answer in the form a + bi.';

// The P2 prompt, kept so the regression figures stay comparable.
const P2_SYSTEM_PROMPT =
  'You are a mathematics tutor for Senior Six students following the Rwanda ' +
  'REB Advanced Mathematics syllabus. Give a short hint about the method ' +
  'first, then the working, then the final answer on its own line.';

function stamp(): string {
  return new Date().toTimeString().slice(0, 8);
}

export function DevScreen({ service }: { service: GuidanceService }): React.JSX.Element {
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ServiceState>(service.state);
  const [output, setOutput] = useState('');
  const [result, setResult] = useState<GuidanceResult | null>(null);
  const [requests, setRequests] = useState(0);
  const [lesson, setLesson] = useState<Lesson | null>(null);

  useEffect(() => service.subscribe(setState), [service]);

  const log = useCallback((msg: string) => {
    setLines(prev => [...prev.slice(-60), `${stamp()}  ${msg}`]);
  }, []);

  const pc = Platform.constants as { Brand?: string; Model?: string; Release?: string };
  const deviceLine =
    Platform.OS === 'android' ? `${pc.Brand} ${pc.Model}, Android ${pc.Release} (API ${Platform.Version})` : `${Platform.OS} ${Platform.Version}`;
  const hermesOn = (globalThis as { HermesInternal?: unknown }).HermesInternal != null;
  const loaded = state === 'ready' || state === 'busy';
  const generating = state === 'busy';

  const checkFile = useCallback(async () => {
    setBusy(true);
    try {
      log(`Reading GGUF header from ${service.modelPath}`);
      const info = (await loadLlamaModelInfo(service.modelPath)) as Record<string, unknown>;
      log(`Header OK, ${Object.keys(info).length} metadata keys`);
      for (const k of ['general.name', 'general.architecture', 'general.size_label']) {
        if (info[k] !== undefined) {
          log(`  ${k} = ${String(info[k])}`);
        }
      }
    } catch (e) {
      log(`FAIL reading model: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [log, service]);

  const loadModel = useCallback(async () => {
    setBusy(true);
    const t0 = Date.now();
    log(`load via guidance service: n_threads=${N_THREADS} n_ctx=${N_CTX} n_gpu_layers=${N_GPU_LAYERS} mmap=on`);
    const ok = await service.ensureLoaded();
    if (ok) {
      log(`Loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      // The decisive line for this CPU: it must be rnllama_jni_v8, the
      // -march=armv8-a build. Any *_v8_2* variant means the loader misread
      // /proc/cpuinfo and a SIGILL is likely during generation.
      log(service.describeEngine());
    } else {
      log(`FAIL load: ${service.unavailableReason ?? 'unknown'}`);
    }
    setBusy(false);
  }, [log, service]);

  const runQuestion = useCallback(async () => {
    const n = requests + 1;
    setRequests(n);
    setOutput('');
    setResult(null);
    log(`Request ${n}: n_predict=${N_PREDICT}`);
    try {
      const r = await service.ask(
        [
          { role: 'system', content: P2_SYSTEM_PROMPT },
          { role: 'user', content: TEST_QUESTION },
        ],
        text => setOutput(text),
      );
      setOutput(r.text);
      setResult(r);
      if (r.outcome === 'generated') {
        const pps = r.promptMs > 0 ? ((r.promptTokens ?? 0) / (r.promptMs / 1000)).toFixed(2) : '–';
        const gps = r.generatedMs > 0 ? ((r.generatedTokens ?? 0) / (r.generatedMs / 1000)).toFixed(2) : '–';
        log(`Done in ${(r.totalMs / 1000).toFixed(1)} s: prompt ${r.promptTokens} tok @ ${pps} tok/s, generated ${r.generatedTokens} tok @ ${gps} tok/s, first token ${r.firstTokenMs === null ? '–' : (r.firstTokenMs / 1000).toFixed(1)} s, reused from cache ${r.cachedTokens ?? '–'}`);
      } else {
        log(`${r.outcome} after ${(r.totalMs / 1000).toFixed(1)} s: ${r.message}`);
      }
    } catch (e) {
      log(`FAIL ask: ${(e as Error).message}`);
    }
  }, [log, requests, service]);

  const cancel = useCallback(async () => {
    log('Cancel requested');
    await service.cancel().catch(e => log(`cancel error: ${(e as Error).message}`));
  }, [log, service]);

  const runStorage = useCallback(async () => {
    setBusy(true);
    try {
      const r = await storageCheck();
      log(`SQLite ${r.dbPath}`);
      log(`attempts: ${r.before} before, ${r.after} after insert (id ${r.insertId})`);
      if (r.before > 0) {
        log(`${r.before} record(s) survived from an earlier launch`);
      }
    } catch (e) {
      log(`FAIL storage: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [log]);

  // Import the bundled packages (a no-op when the version is already loaded)
  // and read the first lesson back from SQLite, so what is rendered has been
  // through the database rather than straight from the bundle.
  const loadContent = useCallback(
    async (verbose: boolean) => {
      const t0 = Date.now();
      const db = getDb();
      const reports = await importPackages(db, PACKAGES);
      for (const r of reports) {
        log(`content ${r.packageId} v${r.version}: ${r.action} (${r.lessons} lesson, ${r.examples} examples, ${r.exercises} exercises)`);
      }
      const lessons = await listLessons(db);
      const first = lessons[0];
      if (!first) {
        log('FAIL content: no lessons in the database');
        return;
      }
      const [pkgLesson, examples, exercises, versions] = await Promise.all([
        getLesson(db, first.id),
        getExamples(db, first.id),
        getExercises(db, first.id),
        getContentVersions(db),
      ]);
      const manifest = PACKAGES.find(p => p.manifest.id === first.packageId)?.manifest;
      if (!pkgLesson || !manifest) {
        log(`FAIL content: lesson ${first.id} could not be read back`);
        return;
      }
      setLesson(toLesson(manifest, pkgLesson, examples, exercises));
      log(`lesson ${first.id} read from SQLite in ${Date.now() - t0} ms (${first.reviewStatus})`);
      if (verbose) {
        for (const v of versions) {
          log(`  ${v.packageId} v${v.version} imported ${v.importedAt}`);
        }
        for (const q of ROUTER_DEMO) {
          const r = routeQuestion(q, lessons);
          log(`  route "${q.slice(0, 44)}…" → ${r ? `${r.lessonId} (${r.matched.join(', ')})` : 'not covered: declined, model not called'}`);
        }
      }
    },
    [log],
  );

  useEffect(() => {
    loadContent(false).catch(e => log(`FAIL content: ${(e as Error).message}`));
  }, [loadContent, log]);

  const runContent = useCallback(async () => {
    setBusy(true);
    try {
      await loadContent(true);
    } catch (e) {
      log(`FAIL content: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [loadContent, log]);

  const release = useCallback(async () => {
    setBusy(true);
    await service.release().catch(e => log(`release error: ${(e as Error).message}`));
    log('Context released');
    setBusy(false);
  }, [log, service]);

  const pps = result && result.promptMs > 0 ? `${((result.promptTokens ?? 0) / (result.promptMs / 1000)).toFixed(2)} tok/s` : '–';
  const gps = result && result.generatedMs > 0 ? `${((result.generatedTokens ?? 0) / (result.generatedMs / 1000)).toFixed(2)} tok/s` : '–';

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={ui.h1}>Developer: model bridge and content checks</Text>
      <Text style={ui.muted}>{deviceLine}</Text>
      <Text style={ui.muted}>{`Hermes ${hermesOn ? 'on' : 'off'} · newArch on · llama.rn 0.12.9 · service ${state}`}</Text>

      <Text style={ui.label}>Model path</Text>
      <TextInput style={styles.input} value={service.modelPath} editable={false} />

      <View style={ui.row}>
        <Button label="1 · Check file" onPress={checkFile} disabled={busy || generating} />
        <Button label="2 · Load model" onPress={loadModel} disabled={busy || generating || loaded} />
      </View>
      <View style={ui.row}>
        <Button label="3 · Ask question" onPress={runQuestion} disabled={!loaded || busy || generating} primary />
        <Button label="Cancel" onPress={cancel} disabled={!generating} danger />
      </View>
      <View style={ui.row}>
        <Button label="4 · Storage check" onPress={runStorage} disabled={busy || generating} />
        <Button label="5 · Content check" onPress={runContent} disabled={busy || generating} />
      </View>
      <View style={ui.row}>
        <Button label="Release model" onPress={release} disabled={!loaded || busy || generating} />
      </View>

      <Text style={ui.label}>Question</Text>
      <Text style={ui.mono}>{TEST_QUESTION}</Text>

      <Text style={ui.label}>Answer{generating ? ' (generating…)' : ''}</Text>
      <Text style={styles.answer}>{output || '–'}</Text>

      <View style={styles.stats}>
        <Stat name="First token" value={result?.firstTokenMs == null ? '–' : `${(result.firstTokenMs / 1000).toFixed(1)} s`} />
        <Stat name="Total" value={result ? `${(result.totalMs / 1000).toFixed(1)} s` : '–'} />
        <Stat name="Prompt" value={pps} />
        <Stat name="Generate" value={gps} />
      </View>

      <Text style={ui.label}>Log</Text>
      <View style={styles.log}>
        {lines.length === 0 ? (
          <Text style={styles.logLine}>Ready.</Text>
        ) : (
          lines.map((l, i) => (
            <Text key={i} style={[styles.logLine, l.includes('FAIL') && styles.logFail]}>
              {l}
            </Text>
          ))
        )}
      </View>

      <Text style={ui.label}>Lesson from the imported package (offline rendering)</Text>
      {lesson ? <LessonView lesson={lesson} onStatus={m => log(`lesson: ${m}`)} /> : <Text style={ui.mono}>Content not loaded yet.</Text>}
    </ScrollView>
  );
}

function Stat({ name, value }: { name: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statName}>{name}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40, gap: 8 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    fontFamily: 'monospace',
    color: colors.text,
  },
  answer: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: 10,
    minHeight: 80,
  },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: colors.tint, borderRadius: 6, padding: 8 },
  statName: { fontSize: 10, color: colors.muted, textTransform: 'uppercase' },
  statValue: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 2 },
  log: { backgroundColor: colors.text, borderRadius: 6, padding: 10 },
  logLine: { fontFamily: 'monospace', fontSize: 11, color: colors.border, lineHeight: 16 },
  logFail: { color: '#FFB4B4' },
});
