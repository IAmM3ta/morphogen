#!/usr/bin/env bash
# Compile Morphogen into GitHub Release archives:
#   morphogen-<ver>-vercel.zip  — Vercel Build Output API (.vercel/output)
#   morphogen-<ver>-src.zip     — source tree at HEAD (no node_modules)
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:-$(node -p "require('./package.json').version")}"
OUT="dist-release"
NAME="morphogen-${VERSION}"

if [[ ! -d .vercel/output/static || ! -f .vercel/output/nitro.json ]]; then
  echo "No compiled output. Run npm run build first." >&2
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT"

echo "Packing ${NAME}-vercel.zip (Vercel prebuilt)…"
python3 - "$OUT/${NAME}-vercel.zip" <<'PY'
import sys, zipfile
from pathlib import Path

out = Path(sys.argv[1])
root = Path(".vercel/output")
with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for path in sorted(root.rglob("*")):
        if path.is_file():
            zf.write(path, path.relative_to(root).as_posix())
PY

echo "Packing ${NAME}-src.zip (source)…"
git archive --format=zip --prefix="${NAME}/" -o "${OUT}/${NAME}-src.zip" HEAD

(
  cd "$OUT"
  sha256sum "${NAME}-vercel.zip" "${NAME}-src.zip" > SHA256SUMS
)

echo
ls -lh "$OUT"
echo
cat "${OUT}/SHA256SUMS"
