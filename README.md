# KPixel 채널 필터

Chrome 확장 프로그램입니다. [youtube.com](https://www.youtube.com) 위에서 `del.kpixel.net/{채널ID}`가 **t**인 채널을 숨깁니다.

숨기는 곳: 댓글, 커뮤니티 게시물, 홈·구독함·추천의 쇼츠/동영상 카드  
쇼츠 피드(`/shorts`): t 채널이 뜨면 숨기지 않고, 유튜브에 보내는 시청 시간을 **정확히 1초**로 고친 뒤 다음 쇼츠로 넘깁니다.  
그대로 두는 곳: 검색 결과, 검색으로 연 채널 페이지의 영상/게시물, 지금 보고 있는 영상

유튜브 innertube 응답(`/youtubei/v1/browse`, `next`, 댓글 등)에서 t 채널 렌더러를 빼고, 이미 그려진 DOM도 추가로 가립니다. 검색 API는 건드리지 않습니다.

## 설치

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 개발자 모드를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다**에서 이 폴더(`manifest.json`이 있는 곳)를 고릅니다.
4. [youtube.com](https://www.youtube.com)을 새로고침합니다.

툴바 아이콘에서 on/off, 이 페이지에서 숨긴 개수, 채널 ID 조회를 할 수 있습니다.

```bash
npm test
```
