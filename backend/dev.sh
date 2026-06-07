export CORS_ALLOW_ORIGIN="http://localhost:5173;http://localhost:8080"
PORT="${PORT:-8080}"

# Load WEBUI_SECRET_KEY (a hard requirement since v0.9.6 when invoking uvicorn
# directly). Mirror start.sh: use the env var if set, otherwise load/generate a
# persisted, gitignored key file so local dev sessions survive restarts.
KEY_FILE="${WEBUI_SECRET_KEY_FILE:-.webui_secret_key}"
if [ -z "${WEBUI_SECRET_KEY:-}" ] && [ -z "${WEBUI_JWT_SECRET_KEY:-}" ]; then
	if [ ! -f "$KEY_FILE" ]; then
		echo "Generating new WEBUI_SECRET_KEY in $KEY_FILE"
		head -c 12 /dev/urandom | base64 > "$KEY_FILE"
	fi
	export WEBUI_SECRET_KEY="$(cat "$KEY_FILE")"
fi

uvicorn open_webui.main:app --port $PORT --host 0.0.0.0 --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-*}" --reload
