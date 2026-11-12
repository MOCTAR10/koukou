#!/bin/sh
# Jenkins helper, run from mobile/: signing key of the OTA updates + runtime version.
#   ota-prepare.sh            create the key pair on the very first run (kept in $SECRETS/ota)
#   ota-prepare.sh --no-generate   never create one (OTA-only job: a new key would not match the APKs)
# Then copies the public certificate into code-signing/ (embedded in the APK, git-ignored) and writes
# the runtime version (native fingerprint) into app.json. Both jobs run the same steps in the same
# order on a clean checkout, so they compute the same runtime version.
set -eu
: "${SECRETS:?SECRETS is not set}"
KEYS="$SECRETS/ota"
if [ ! -f "$KEYS/private-key.pem" ] || [ ! -f "$KEYS/certificate.pem" ]; then
  if [ "${1:-}" = "--no-generate" ]; then
    echo "Pas de clé de signature OTA dans $KEYS : lancez d'abord le job fermia-android." >&2
    exit 1
  fi
  T=$(mktemp -d)
  npx expo-updates codesigning:generate --key-output-directory "$T/k" --certificate-output-directory "$T/c" \
    --certificate-validity-duration-years 20 --certificate-common-name Fermia
  mkdir -p "$KEYS"
  umask 077
  cp "$T/k/private-key.pem" "$KEYS/private-key.pem"
  cp "$T/c/certificate.pem" "$KEYS/certificate.pem"
  rm -rf "$T"
  echo "Clé de signature OTA créée dans $KEYS (à sauvegarder)."
fi
mkdir -p code-signing
cp "$KEYS/certificate.pem" code-signing/certificate.pem
node scripts/ota.mjs runtime
