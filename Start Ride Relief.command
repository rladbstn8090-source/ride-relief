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
echo 'Ride Relief를 엽니다. 종료하려면 Control+C를 누르세요.'
echo '이미 실행 중이라면 http://127.0.0.1:5173/ 를 여세요.'
npm run dev -- --port 5173 --strictPort --open
read '?Enter 키를 누르면 닫힙니다. '
