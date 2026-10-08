#!/bin/sh
# Writes /usr/share/nginx/html/config.js from the API_URL / DEMO_MODE env
# vars, so a deployed image can be pointed at any API without rebuilding it.
# Runs via the nginx base image's own /docker-entrypoint.sh hook directory;
# a non-zero exit aborts container start - fail loud, never serve stale config.
set -e

# ":=" so an EMPTY value counts as unset too (POSIX parameter expansion).
: "${API_URL:=http://localhost:8000/api}"
: "${DEMO_MODE:=false}"

# Closed set, mirroring the EMAIL_MODE startup check in backend settings.
# Case-insensitive like the backend's own read (DEMO_MODE.lower() == 'true'):
# prod/.env feeds one DEMO_MODE to both, so a "True" the backend accepts must
# not crash-loop the ui. Normalized, so config.js always carries lowercase.
case "$DEMO_MODE" in
    [Tt][Rr][Uu][Ee]) DEMO_MODE=true ;;
    [Ff][Aa][Ll][Ss][Ee]) DEMO_MODE=false ;;
    *)
        echo "Error: DEMO_MODE must be 'true' or 'false' (any case), got: '${DEMO_MODE}'" >&2
        exit 1
        ;;
esac

# Reject JSON/JS breakout characters: both values are interpolated into a
# JavaScript string literal below, so " \ ` < could escape it.
reject_breakout_chars() {
    # $1 = variable name (for the error message), $2 = its value
    case "$2" in
        *'"'* | *'\'* | *'`'* | *'<'*)
            echo "Error: ${1} must not contain double quote, backslash, backtick or less-than (JSON/JS breakout guard), got: ${2}" >&2
            exit 1
            ;;
    esac
}

reject_breakout_chars API_URL "$API_URL"
reject_breakout_chars DEMO_MODE "$DEMO_MODE"

# Byte-stable contract with the SPA reader (frontend/src/runtimeConfig.ts,
# Task 1): both keys always present, exactly this shape.
cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = {"apiUrl":"${API_URL}","demoMode":"${DEMO_MODE}"};
EOF

echo "30-app-config.sh: wrote /usr/share/nginx/html/config.js (apiUrl=${API_URL}, demoMode=${DEMO_MODE})"
