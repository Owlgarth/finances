# Backend Container Probes

Part of the `frontend-live-stack-probing` skill. Read before checking dependency versions, beat schedules or other runtime state inside the backend containers.

## Backend container probes

- Dependency version probes inside the api container must select the project venv explicitly:
  `docker compose exec api uv pip list --python /venv`. `uv run` honors `UV_PROJECT_ENVIRONMENT`
  but `uv pip` does NOT - bare `uv pip list` silently reports the container's /usr/local system
  env, so the probe succeeds while listing the wrong environment entirely.
- Expected-version tables for in-container probes derive from lock MARKERS, not lock rows: a
  package can move in `uv.lock` and still be absent from the Linux venv when every reference
  is `sys_platform == 'win32'`-gated (tzdata rides celery -> tzlocal -> tzdata, win32-only,
  so kombu 5.7's tzdata floor bump shows in the lock diff but never installs in the
  container). A table copied from raw lock rows fails a correct venv - re-derive the install
  set from the package's marker lines before calling a missing version drift.
- Reading beat's PersistentScheduler shelve file: a live read-only open is blind to the
  un-checkpointed sqlite WAL (`no such table: Dict`), and `docker compose exec` cannot target a
  stopped container. Working sequence: graceful `docker compose stop beat` (the close
  checkpoints and removes the -wal file) -> `docker cp` the file out -> start beat -> read on the
  host with the backend/.venv python (plain sqlite3 + pickle; raw shelve Dict keys are BYTES,
  not str). A beat-schedule gate asserts OUR entry (task + crontab), never the default-entry
  set: `celery.backend_cleanup` is not installed when the result backend is redis
  (`supports_autoexpire == True` skips it), so an assertion over the default entries is
  vacuously empty either way.
- celery 5.6's PersistentScheduler shelve layout is nested, not flat: top-level keys are
  scheduler metadata (`b'__version__'`, `b'tz'`, `b'utc_enabled'`) and all schedule entries
  nest under ONE `b'entries'` dict key whose inner keys are STR - reading top-level values as
  entries crashes the unpickle on the metadata. A beat-schedule PASS gate names the
  authoritative artifact, the shelve CONTENT, never a boot log line: celery 5.6's beat prints
  no "Scheduler: Writing entries..." INFO line at all, so a log-line gate fails on a healthy
  schedule.
- Django's RedisCache stores keys as `<KEY_PREFIX>:<VERSION>:<key>` - with the default empty
  prefix and version 1 every key carries a LEADING `:1:`, so a redis-cli scan pattern like
  `ratelimit:login*` (the throttle key is `ratelimit:<name>:<ip>`) matches nothing while the
  cache provably holds the entries. Lead the pattern with a wildcard (`*ratelimit:login:*`)
  or otherwise account for the makeup, and confirm by reading a matched key's full name.
- HTTP status capture: `curl -w '%{http_code}' | tee f | head -c N` silently loses the status
  line - head's early exit SIGPIPEs tee before the -w trailer is written. Capture to a file
  with no `head` in the pipeline, then read the file. The readiness-loop twin: on connection
  failure `curl -w '%{http_code}'` itself prints `000`, and an `|| echo 000` fallback appends
  a SECOND `000` - the sentinel check reads `000000 != 000` and the loop misfires on the very
  first connection failure. The fallback must ASSIGN the sentinel (`|| code=000`), never
  echo it.
