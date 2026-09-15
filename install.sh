#!/usr/bin/env bash
set -euo pipefail

# GitHub + curl:
#   curl -fsSL https://raw.githubusercontent.com/USER/REPO/main/install.sh | bash -s -- USER/REPO
# Already cloned:
#   ./install.sh --local

REPO="${1:-${YTERM_GITHUB:-}}"
DEST="${YTERM_HOME:-$HOME/.local/share/yterm}"
BIN="${YTERM_BIN:-$HOME/.local/bin}"

if [[ "${REPO}" == "--local" ]]; then
  DEST="$(cd "$(dirname "$0")" && pwd)"
else
  if [[ -z "${REPO}" ]]; then
    echo "GitHub 저장소가 필요합니다."
    echo "  curl -fsSL https://raw.githubusercontent.com/계정/저장소/main/install.sh | bash -s -- 계정/저장소"
    echo "이 폴더에 이미 있다면: ./install.sh --local"
    exit 1
  fi
  command -v git >/dev/null || { echo "git 이 필요합니다"; exit 1; }
  URL="${REPO}"
  if [[ "${URL}" != http* ]]; then
    URL="https://github.com/${REPO}.git"
  fi
  echo "[1/4] ${URL}"
  if [[ -d "${DEST}/.git" ]]; then
    git -C "${DEST}" pull --ff-only
  else
    mkdir -p "$(dirname "${DEST}")"
    rm -rf "${DEST}"
    git clone --depth 1 "${URL}" "${DEST}"
  fi
fi

command -v node >/dev/null || { echo "Node.js 20+ 가 필요합니다"; exit 1; }

echo "[2/4] npm install"
(cd "${DEST}" && npm install)

echo "[3/4] 실행 파일"
mkdir -p "${BIN}"
cat > "${BIN}/yterm" <<EOF
#!/usr/bin/env bash
exec node "${DEST}/bin/yterm.js" "\$@"
EOF
chmod +x "${BIN}/yterm" "${DEST}/bin/yterm" || true

echo "[4/4] ffmpeg / yt-dlp"
if ! command -v ffmpeg >/dev/null; then
  echo "ffmpeg 가 없습니다. 재생에 필요합니다."
fi
if ! command -v yt-dlp >/dev/null; then
  if command -v pip3 >/dev/null; then
    pip3 install -q --user yt-dlp || true
  fi
fi

echo
echo "설치됨. PATH 에 ${BIN} 이 있으면:"
echo "  yterm"
echo "  yterm --demo"
echo
