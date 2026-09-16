# 댓글나무 + ASCII 유튜브 (`yterm`)

유튜브 댓글을 트리로 복사하는 웹앱과, **CMD에서 피드를 고르고 8 FPS 컬러 ASCII로 재생**하는 터미널 플레이어입니다.

방향키는 커서를 옮기기만 합니다. 추천·댓글·다음 페이지는 그 화면을 열 때만 한 번씩 불러서 과부하를 주지 않습니다.

## CMD 설치 (GitHub + curl)

한 줄만 복사해서 CMD에 붙여 넣으세요. 다른 명령이랑 붙이지 마세요.

```bat
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/13ksh/yterm/main/setup.ps1 | iex"
```

끝나면 CMD를 **닫고 새로 연 다음**:

```bat
yterm --demo
```

안 되면:

```bat
%LOCALAPPDATA%\yterm\yterm.cmd --demo
```

설치 스크립트는 영문입니다. 예전 `install.cmd` 주소는 Windows CDN에 깨진 파일이 남을 수 있어 `setup.ps1` 을 쓰세요.

Node.js 20+ : https://nodejs.org  
재생: `winget install Gyan.FFmpeg`

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/13ksh/yterm/main/install.sh | bash
yterm --demo
```

필요: Node.js 20+, git, 재생 시 `ffmpeg`. 유튜브 스트림은 `yt-dlp` (설치 스크립트가 있으면 같이 넣습니다).

설치 스크립트는 **영문 CMD** 입니다. 한글이 섞이면 Windows가 명령을 잘라 먹습니다.

`yterm` 을 못 찾으면 **새 CMD 창**을 열거나 이걸 실행하세요:

```bat
%LOCALAPPDATA%\yterm\yterm.cmd --demo
```

재생에는 `ffmpeg` 가 필요합니다: `winget install Gyan.FFmpeg`

## 터미널 조작

```
yterm                 인기 급상승 피드 (막히면 예시 피드)
yterm --demo          예시 피드
yterm --demo --snapshot
yterm https://www.youtube.com/watch?v=VIDEO_ID
```

| 키 | 동작 | 네트워크 |
| --- | --- | --- |
| ↑ ↓ | 목록에서 선택만 이동 | 없음. 맨 아래 근처일 때만 다음 **페이지** 1회 |
| Enter | 그 영상만 8 FPS 재생 | 재생할 때만 |
| → / r | 그 영상의 추천 | 영상당 1회 캐시 |
| c | 그 영상의 댓글 첫 페이지 | 영상당 1회 캐시 |
| / | 검색 | Enter 를 눌렀을 때만 |
| ← | 뒤로 | 없음 |
| space | 재생 중 일시정지 | 없음 |
| q | 종료 | 없음 |

영상 파일은 저장하지 않습니다. 유튜브가 봇 확인을 걸면 `--demo` 또는 로컬 `yt-dlp` 쿠키를 쓰세요.

개발 중:

```bash
npm install
npm run yterm -- --demo
```

## 웹 — 댓글 트리

```bash
npm run dev
```

브라우저에서 [http://127.0.0.1:43147](http://127.0.0.1:43147) 을 엽니다. 유튜브 주소를 붙여 넣어 댓글 트리를 만들고 복사합니다. 댓글 개수 제한은 없습니다.

```
2026 아우라 노래 모음집
├─@hsh 이거 진짜임
│  ├─@사람 ㄹㅇ
│  ├─@disco 그건 아닌듯
│  ├─@licen 뭔 소리임;
│  │  └─@hsh 왜 시비임
│  └─@86 아하
└─@eos 저게 뭐임
    ├─@hdd 노래잖아
    └─@천재 영상임
```

```bash
npm test
npm run build
```
