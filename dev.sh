#!/usr/bin/env bash
# The dev entry point for Owlgarth Finances: docker compose for the services, and the
# backend/frontend commands either in their container or on the host.
# Run ./dev.sh for the command list.
#
# Bash, not sh: pipefail, read -rp and local are not POSIX.
set -euo pipefail
cd "$(dirname "$0")"

INFRA_SERVICES=(db redis storage)

die() {
    echo "$*" >&2
    exit 1
}

usage() {
    cat <<'EOF'
Usage: ./dev.sh <command> [args]

Start (one terminal each)
  up [svc...]           Services in Docker (default: db redis storage)
  up --full             Everything in Docker, app included
  backend               API + Celery worker, after migrate/seed
  frontend              Vite dev server

Services (docker compose)
  down                  Stop and remove containers
  stop [svc...]         Stop without removing
  restart [svc...]      Restart services
  build [svc...]        Rebuild images
  ps                    Service status
  logs [svc...]         Follow logs
  reset                 Remove containers AND volumes (asks first)
  sh <svc>              Interactive shell in a service

Backend
  manage <args>         manage.py <args>
  migrate [args]        Apply migrations
  makemigrations [app]  Create migrations
  seed                  Seed currencies + legal documents
  shell                 Django shell
  psql                  psql session on the dev database
  test [args]           pytest
  lint                  ruff check --fix + ruff format + eslint

Frontend
  npm <args>            npm in frontend/

Release
  release <X.Y.Z>       Tag a release: checks, changelog, commit, tag, push
    [--dry-run]         Print the steps without executing anything
    [--skip-tests]      Skip the local lint + test gate

Backend and frontend commands run in their container (DEV_TARGET=docker, the
default: nothing but Docker is needed on your machine) or on your machine with
uv and npm (DEV_TARGET=host, faster). Set DEV_TARGET in .env, or per command:

  DEV_TARGET=host ./dev.sh test
EOF
}

load_env() {
    [ -f .env ] || die "Error: .env is missing — create it with: cp example.env .env"
    local target=${DEV_TARGET:-}

    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a

    # A DEV_TARGET given on the command line wins over the one in .env.
    if [ -n "$target" ]; then
        export DEV_TARGET="$target"
    fi
}

# Inside the compose network services reach each other by service name; a
# process started on the host has to go through the published ports.
use_local_hosts() {
    export POSTGRES_HOST=localhost
    export POSTGRES_PORT="$DB_PORT"
    export REDIS_URL="redis://localhost:$REDIS_PORT"
    export CELERY_BROKER_URL="redis://localhost:$REDIS_PORT/0"
    export CELERY_RESULT_BACKEND="redis://localhost:$REDIS_PORT/1"
    export S3_ENDPOINT_URL="http://localhost:$STORAGE_PORT"
}

# Fail with a hint instead of a connection timeout.
require_service() {
    [ -n "$(docker compose ps -q --status running "$1" 2>/dev/null)" ] && return 0
    die "Error: '$1' is not running — start it with: ./dev.sh up"
}

on_host() { [ "${DEV_TARGET:-docker}" = "host" ]; }

# Run in the service if it is up, in a one-off container otherwise.
# --user: whatever the command writes into the bind mount stays yours, not root's.
# HOME: uv, npm and pytest need a writable one for their caches.
in_service() {
    local svc=$1
    shift
    local opts=(--user "$(id -u):$(id -g)" -e HOME=/tmp)

    if [ -n "$(docker compose ps -q --status running "$svc" 2>/dev/null)" ]; then
        docker compose exec "${opts[@]}" "$svc" "$@"
        return
    fi

    # --entrypoint '': the image entrypoint migrates and collects static.
    docker compose run --rm "${opts[@]}" --entrypoint '' "$svc" "$@"
}

# python manage.py …, pytest …, ruff … — /venv is UV_PROJECT_ENVIRONMENT in the image.
# On the host, `uv run` creates backend/.venv and syncs it to uv.lock by itself,
# so there is nothing to set up first and nothing to activate.
backend_run() {
    if on_host; then
        command -v uv >/dev/null ||
            die "Error: uv is not installed — see https://docs.astral.sh/uv/, or set DEV_TARGET=docker"
        use_local_hosts
        (cd backend && uv run "$@")
        return
    fi
    in_service api "/venv/bin/$1" "${@:2}"
}

frontend_run() {
    if on_host; then
        command -v npm >/dev/null ||
            die "Error: npm is not installed — install Node 22+, or set DEV_TARGET=docker"
        (cd frontend && "$@")
        return
    fi
    in_service node "$@"
}

django() {
    require_service db
    backend_run python manage.py "$@"
}

# --build so a Dockerfile or frontend change is picked up without a separate step.
start_services() {
    if [ $# -gt 0 ] && [ "$1" != "--full" ]; then
        docker compose up -d --build "$@"
        return
    fi

    if [ "${1-}" = "--full" ]; then
        docker compose up -d --build
    else
        docker compose up -d --build "${INFRA_SERVICES[@]}"
    fi

    docker compose ps
    cat <<EOF

  Postgres  localhost:$DB_PORT   Redis  localhost:$REDIS_PORT
  Storage   http://localhost:$STORAGE_PORT   console  http://localhost:$STORAGE_CONSOLE_PORT

Next: ./dev.sh backend and ./dev.sh frontend (one terminal each).
EOF
}

wait_for_db() {
    local _
    for _ in $(seq 1 30); do
        docker compose exec -T db pg_isready -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" && return 0
        sleep 1
    done
    die "Error: the database did not become ready in 30s."
}

# Migrations and seeds run first — in Docker that is the image entrypoint's job.
# On the host, Ctrl-C stops both the server and the worker.
start_backend() {
    if ! on_host; then
        docker compose up -d --build api worker
        echo "Ctrl-C stops following the logs; the containers keep running (./dev.sh stop api worker)."
        exec docker compose logs -f api worker
    fi

    use_local_hosts
    require_service db
    require_service redis
    [ "${USE_S3_STORAGE:-false}" = "true" ] && require_service storage
    wait_for_db

    backend_run python manage.py migrate
    backend_run python manage.py seed_currencies
    backend_run python manage.py seed_legal_documents
    if [ "${USE_S3_STORAGE:-false}" = "true" ]; then
        backend_run python manage.py init_storage_buckets
    fi

    # Stop the worker when the server stops.
    trap 'kill 0' EXIT

    if [ "${CELERY_TASK_ALWAYS_EAGER:-false}" = "true" ]; then
        echo "CELERY_TASK_ALWAYS_EAGER=true — tasks run inline, no worker started."
    else
        backend_run celery -A config worker --loglevel=info &
    fi

    # No periodic tasks are defined yet, so beat is not started; if that changes,
    # run it in the stack with: ./dev.sh up beat
    # No exec: the trap above has to survive to clean up the worker.
    backend_run uvicorn config.asgi:application --host 0.0.0.0 --port "$API_PORT" --reload
}

# VITE_API_URL comes from .env, so it already points at the backend's port.
start_frontend() {
    if ! on_host; then
        # --service-ports publishes UI_PORT for this one-off container; the dev
        # server itself always listens on 5173 inside it.
        exec docker compose run --rm --service-ports --user "$(id -u):$(id -g)" -e HOME=/tmp node \
            sh -c '[ -x node_modules/.bin/vite ] || npm install --legacy-peer-deps
                   exec npm run dev -- --host --port 5173'
    fi

    cd frontend
    [ -x node_modules/.bin/vite ] || npm install --legacy-peer-deps
    exec npm run dev -- --host --port "$UI_PORT"
}

# Fallback changelog section when git-cliff is not installed: prepend a
# "## [X.Y.Z] - YYYY-MM-DD" header plus one bullet per commit since the last
# v-tag (full history when there is none yet). Creates CHANGELOG.md with a
# "# Changelog" header if the file does not exist.
fallback_changelog() {
    local version=$1 last_tag=$2
    local range=HEAD
    if [ -n "$last_tag" ]; then
        range="$last_tag..HEAD"
    fi
    local tmp
    tmp=$(mktemp)

    {
        echo "## [$version] - $(date +%Y-%m-%d)"
        echo
        git log --pretty=format:'- %s (%h)' "$range"
        echo
    } >"$tmp"

    if [ -f CHANGELOG.md ]; then
        cat "$tmp" CHANGELOG.md >CHANGELOG.md.tmp && mv CHANGELOG.md.tmp CHANGELOG.md
    else
        {
            echo "# Changelog"
            echo
            cat "$tmp"
        } >CHANGELOG.md
    fi
    rm -f "$tmp"
}

# Tag a release from branch main: pre-flight checks, local lint + test gate,
# VERSION, changelog, version sync, commit, annotated tag, push. Fail-closed:
# any failed check dies before anything is written or tagged. --dry-run prints
# every step without executing it; the git-state checks are only reported
# there, so a dry run also works from a feature branch.
release() {
    local version='' dry_run=false skip_tests=false
    local arg
    for arg in "$@"; do
        case "$arg" in
        --dry-run) dry_run=true ;;
        --skip-tests) skip_tests=true ;;
        -*) die "usage: ./dev.sh release <X.Y.Z> [--dry-run] [--skip-tests]" ;;
        *)
            [ -z "$version" ] ||
                die "usage: ./dev.sh release <X.Y.Z> [--dry-run] [--skip-tests]"
            version=$arg
            ;;
        esac
    done
    [ -n "$version" ] || die "usage: ./dev.sh release <X.Y.Z> [--dry-run] [--skip-tests]"
    [[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
        die "Error: '$version' is not an X.Y.Z version (digits only, no pre-release suffix)."

    local tag="v$version"
    local branch
    branch=$(git branch --show-current)
    local last_tag
    last_tag=$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null) || last_tag=

    echo "Releasing $version as $tag"
    echo "  branch:    ${branch:-<detached>}"
    echo "  last tag:  ${last_tag:-none (changelog covers full history)}"
    if command -v git-cliff >/dev/null; then
        echo "  changelog: git-cliff"
    else
        echo "  changelog: git log fallback (git-cliff not found)"
    fi
    if [ "$skip_tests" = true ]; then
        echo "  test gate: skipped (--skip-tests)"
    else
        echo "  test gate: ./dev.sh lint + ./dev.sh test"
    fi
    if [ "$dry_run" = true ]; then
        echo "  mode:      dry run - printing the steps, executing nothing"
    fi
    echo

    # Pre-flight checks. Fail closed; a dry run only reports them so the
    # whole step list still prints from any checkout state.
    if [ "$dry_run" = true ]; then
        [ "$branch" = main ] ||
            echo "[dry-run] would fail: not on branch main (here: ${branch:-detached})"
        [ -z "$(git status --porcelain)" ] ||
            echo "[dry-run] would fail: working tree is not clean"
        if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
            echo "[dry-run] would fail: tag $tag already exists"
        fi
    else
        [ "$branch" = main ] ||
            die "Error: releases are cut from branch main (here: ${branch:-detached})."
        [ -z "$(git status --porcelain)" ] ||
            die "Error: working tree is not clean - commit or stash first."
        if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
            die "Error: tag $tag already exists."
        fi
    fi

    # Local gate before anything is written. lint runs ruff check --fix and
    # ruff format, so it can dirty the tree again; those fixes are left for
    # the author - only the release files are committed below.
    if [ "$skip_tests" = true ]; then
        echo "Skipping the lint + test gate (--skip-tests)."
    elif [ "$dry_run" = true ]; then
        echo "[dry-run] would run: ./dev.sh lint"
        echo "[dry-run] would run: ./dev.sh test"
    else
        ./dev.sh lint
        ./dev.sh test
    fi

    # VERSION, then a paranoia re-read: the file must say exactly X.Y.Z.
    if [ "$dry_run" = true ]; then
        echo "[dry-run] would write: VERSION ($version)"
    else
        printf '%s\n' "$version" >VERSION
        [ "$(cat VERSION)" = "$version" ] ||
            die "Error: VERSION does not read '$version' - nothing committed yet."
    fi

    # Changelog: git-cliff when installed, else the git log fallback.
    if [ "$dry_run" = true ]; then
        if command -v git-cliff >/dev/null; then
            echo "[dry-run] would run: git cliff --tag $tag --unreleased --prepend CHANGELOG.md"
        else
            echo "[dry-run] would prepend: git log section to CHANGELOG.md (fallback)"
        fi
    elif command -v git-cliff >/dev/null; then
        git cliff --tag "$tag" --unreleased --prepend CHANGELOG.md
    else
        echo "Note: git-cliff not found - using the git log fallback for the changelog."
        fallback_changelog "$version" "$last_tag"
    fi

    # Version sync: nothing reads these two, but keep them from drifting.
    # The 0,/re/ address touches only the first matching line of each file.
    if [ "$dry_run" = true ]; then
        echo "[dry-run] would sync: backend/pyproject.toml, frontend/package.json"
    else
        sed -i "0,/^version = \".*\"$/s//version = \"$version\"/" backend/pyproject.toml
        sed -i "0,/^  \"version\": \".*\",$/s//  \"version\": \"$version\",/" frontend/package.json
    fi

    # Stage an explicit file list only (never -A), commit, tag, push.
    local files=(VERSION CHANGELOG.md)
    if [ "$dry_run" = true ]; then
        echo "[dry-run] would stage: VERSION CHANGELOG.md"
        echo "[dry-run] would stage: backend/pyproject.toml, frontend/package.json (when changed)"
        echo "[dry-run] would commit: chore(release): $tag"
        echo "[dry-run] would tag: $tag (annotated)"
        echo "[dry-run] would push: origin main $tag"
        echo "[dry-run] done - nothing was executed."
        return 0
    fi

    # pyproject/package.json go into the commit only when the sync changed them.
    git diff --quiet -- backend/pyproject.toml || files+=(backend/pyproject.toml)
    git diff --quiet -- frontend/package.json || files+=(frontend/package.json)

    git add "${files[@]}"
    git commit -m "chore(release): $tag"

    # Fail closed one last time: the tag must still be absent right before it
    # is created (also checked before anything was written above).
    if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
        die "Error: tag $tag exists after all - aborting before tagging (the commit is local: git reset --soft HEAD~1 undoes it)."
    fi
    git tag -a "$tag" -m "Release $version"
    git push origin main "$tag"

    echo "Released $tag - pushed main and the tag to origin."
}


cmd=${1-}
[ -n "$cmd" ] || {
    usage
    exit 0
}
shift
load_env

case "$cmd" in
up) start_services "$@" ;;
backend) start_backend ;;
frontend) start_frontend ;;
down | stop | restart | build | ps) docker compose "$cmd" "$@" ;;
logs) docker compose logs -f --tail=100 "$@" ;;
reset)
    read -rp "Remove containers and volumes, including the database? [y/N] " answer
    [ "$answer" = y ] || [ "$answer" = Y ] || die "Aborted."
    docker compose down -v
    ;;
sh)
    [ $# -eq 1 ] || die "usage: ./dev.sh sh <service>"
    require_service "$1"
    docker compose exec "$1" sh
    ;;
manage)
    [ $# -gt 0 ] || die "usage: ./dev.sh manage <args>"
    django "$@"
    ;;
migrate | makemigrations | shell | createsuperuser) django "$cmd" "$@" ;;
seed)
    django seed_currencies
    django seed_legal_documents
    ;;
psql)
    require_service db
    docker compose exec db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
    ;;
test)
    require_service db
    backend_run pytest "$@"
    ;;
lint)
    backend_run ruff check --fix .
    backend_run ruff format .
    frontend_run npm run lint
    ;;
npm)
    [ $# -gt 0 ] || die "usage: ./dev.sh npm <args>"
    frontend_run npm "$@"
    ;;
release)
    release "$@"
    ;;
help | -h | --help) usage ;;
*)
    echo "Unknown command: $cmd" >&2
    usage >&2
    exit 1
    ;;
esac
