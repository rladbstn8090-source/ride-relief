#!/bin/zsh -l
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js 20.19 이상이 필요합니다. https://nodejs.org 에서 LTS를 설치한 뒤 다시 실행하세요.'
  read '?Enter 키를 누르면 닫힙니다. '
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci || { read '?설치에 실패했습니다. 인터넷 연결을 확인하세요. Enter 키로 종료: '; exit 1; }
fi
LAN_IP=$(/usr/sbin/ipconfig getifaddr en0 2>/dev/null)
if [[ -z "$LAN_IP" ]]; then LAN_IP=$(/usr/sbin/ipconfig getifaddr en1 2>/dev/null); fi
if [[ -z "$LAN_IP" ]]; then
  echo '와이파이 주소를 찾지 못했습니다. 와이파이에 연결한 뒤 다시 실행하세요.'
  read '?Enter 키를 누르면 닫힙니다. '
  exit 1
fi
SHARE_URL="http://${LAN_IP}:5173/"
echo "휴대폰과 Mac을 같은 와이파이에 연결하세요."
echo "접속 주소: ${SHARE_URL}"
(sleep 2; open "$SHARE_URL") &
npm run dev:lan -- --port 5173 --strictPort
read '?Enter 키를 누르면 닫힙니다. '
