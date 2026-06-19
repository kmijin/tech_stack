#!/bin/bash
set -e

echo ">>> 빌드 시작..."
cd "$(dirname "$0")/frontend"
npm run build

echo ">>> dist 복사 중..."
DEST="D:/mijin/workspace/techStack/dist"
rm -rf "$DEST"
cp -r dist "$DEST"

echo ">>> 완료! $DEST 업데이트됨"
