# v1 readiness run, 19 October 2026

Evidence for the readiness run in [../../RELEASE_V1.md](../../RELEASE_V1.md):
the pilot build 1.0.0 (commit `b348c17` of the development repository this
one was cleaned from) on the ATMPC IT-801B, airplane
mode on, 20:30 to 20:56, test learner codes `R1` and `R2` only.

- `*.csv`, `manifest.json`: the export written by Teacher tools at the end
  of the run, copied off the tablet unchanged.
- `app-log.txt`: the application's own log lines for the run (`adb logcat`,
  tag `ReactNativeJS`), filtered to the app's categories.
- `cpu-temperature-and-battery.txt`: CPU temperature from
  `dumpsys hardware_properties` and the battery level, every 10 s. The
  tablet was on USB power throughout.
