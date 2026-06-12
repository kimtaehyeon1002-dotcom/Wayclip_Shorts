# remotion-shorts

세로형 쇼츠(YouTube Shorts / Reels / TikTok) 양산용 — **Remotion(React) 판.** `hyperframes-shorts` 와 정확히 같은 역할(일본 타깃 5개 채널, 1080×1920 30fps, 컷편집 없는 자막 쇼츠)을 HyperFrames 대신 Remotion 으로 한다.

**채널별 컴포지션(`src/channels/`) + 영상별 props 격리(`videos/<ch>/<n>/props.json`) + 채널별 결재본 분리(`output/<ch>/`).**

## 채널 (5개)

| slug | 한국어 별명 | preview 포트 | Composition id | 비고 |
| --- | --- | --- | --- | --- |
| `goodvibesongs` | 굿바이브 | **3003** | `goodvibesongs` | 음악 + 듀얼 자막, 검정 배경. default en→ko |
| `goodmovies` | 굿무비 | **3004** | `goodmovies` | 영화 클립, 흰 배경 / 검정 멘트, 노란 번역. default en→ja |
| `readyaction` | 레디액션 | **3005** | `readyaction` | 영화 클립, 검정 배경, 시리즈 카피 + #번호 + 영화 정보. default en→ja |
| `thishiphop` | 디스힙합 | **3006** | `thishiphop` | 힙합 트랙, 검정 배경, 영상별 멘트 + #번호 + 영문 Artist-Track. default en→ja |
| `space_lab` | 스페이스랩 | **3007** | `space-lab` | 정보 쇼츠, contain(잘림 X), 헤드라인 + 빨간 깜빡 경고 + 고정 CTA, **자막 없음**. default ja→ja |

> ⚠️ `space_lab` 의 **Composition id 는 `space-lab`** (Remotion id 는 언더스코어 불가). 디렉토리/대화에선 `space_lab` slug 그대로 쓰되, `remotion render`/`still` 의 id 만 `space-lab`. `tools/preview.mjs` 와 `new-video.mjs` 안내가 자동 변환해 준다.

**사용자는 대화에서 한국어 별명으로 부름.** 코드/경로엔 slug 사용.

**중요:** 새 영상 작업(스캐폴드/번역/렌더) 요청 시 **시작 전에 어느 채널인지 먼저 물어볼 것.** 경로(`videos/goodvibesongs/076`)에서 자명하거나 메시지에 채널이 있으면 다시 묻지 말 것. 인프라/도구 작업은 안 물어도 됨.

각 채널의 레이아웃·타이포·색상 표준은 `src/channels/<Channel>.tsx` 상단 주석과 아래 "채널별 레이아웃 요약" 참조.

## HyperFrames 판과의 차이 (핵심)

| | HyperFrames 판 | Remotion 판 (이 프로젝트) |
| --- | --- | --- |
| 컴포지션 | 영상별 `index.html` 복사본 | `src/channels/*.tsx` 채널당 1개, `--props` 로 데이터 주입 |
| 변수 | `data-composition-variables` + `vars.json` | `videos/<ch>/<n>/props.json` (zod 스키마 `src/props.ts`) |
| 자막 | `captions.js` (`window.__captions`) | `props.json` 의 `captions` 배열 |
| 애니메이션 | GSAP paused timeline seek | `useCurrentFrame()` + `interpolate` (프레임 순수 함수) |
| 미디어 | `source.mp4` 심볼링크 + `<video>` | `source.mp4` **하드링크** + `--public-dir=영상디렉토리` + `<OffthreadVideo staticFile>` |
| 길이 | `data-duration` 하드코딩 | `props.durationInFrames` + `calculateMetadata` |
| STT | `npx hyperframes transcribe` | `node tools/transcribe.mjs` (whisper.cpp 내장) |
| preview/render | `npx hyperframes …` | `npx remotion studio/render` |
| 검정 프레임 정규화 | `normalize-output.mjs` 필수 | **불필요** — Remotion 출력은 video/audio start_time 이 이미 0 (edit-list 아티팩트 없음). normalize 돌리면 오히려 0.066s 오프셋이 생기므로 **쓰지 말 것.** |

### 미디어 경로 / `--public-dir` (중요)

Remotion 의 `staticFile()` 은 "public 루트"만 본다. 렌더 시 그 디렉토리를 임시 번들로 복사하는데, **(a) 심볼링크는 건너뛰고(404), (b) 디렉토리 전체를 복사**한다. 그래서:

- **각 영상의 `source.mp4` 는 `media/<slug>.mp4` 의 하드링크** (`new-video` 자동 생성). 심볼링크는 번들에서 누락되므로 하드링크 — 같은 볼륨이면 inode 공유라 추가 디스크 0이고 실제 파일로 인식돼 복사된다.
- **렌더/프리뷰는 `--public-dir=videos/<ch>/<n>` 로 그 영상 디렉토리를 public 루트로 지정.** `props.videoSrc = "source.mp4"` → `staticFile("source.mp4")`. 이렇게 하면 **그 영상의 미디어 1개만 번들**된다 (모든 영상을 한 public/media 에 쌓으면 렌더마다 전부 복사돼 느려짐).
- **폰트는 `public/` 에 두지 않는다** — Google Fonts + Pretendard 모두 원격(`src/fonts.ts`)에서 로드하므로 `--public-dir` 가 영상 디렉토리를 가리켜도 폰트는 영향 없음.

## 파일 구조

```
remotion-shorts/
├── CLAUDE.md
├── package.json              # remotion + @remotion/*. dev:<channel> 스크립트(고정 포트)
├── remotion.config.ts        # h264 / aac / yuv420p
├── src/
│   ├── index.ts  Root.tsx    # 5개 <Composition> 등록 + calculateMetadata(durationInFrames)
│   ├── props.ts              # zod 스키마(채널별) + Caption 타입 + 채널 default
│   ├── fonts.ts  lang.ts     # 결정적 폰트 로딩 + 언어→폰트/표시 분기
│   ├── channels/*.tsx        # 채널당 컴포지션 1개
│   └── components/           # ThreeBand 없음 — BackgroundVideo / CaptionTrack / TopCaption / WarnPill
├── media/<slug>.mp4 + <slug>.json       # 공유 원본 + 사이드카 (prep-media 임포트)
├── tools/                    # 아래 "도구" 참조
├── videos/<ch>/<n>/          # 영상별: props.json + meta.json + source.mp4(하드링크). 렌더 시 --public-dir 가 여기를 가리킴
└── output/<ch>/<n>.mp4       # 결재된 최종본
```

## 현재 스코프 / 다국어 / 자막 표시 규칙

- **인풋:** 음악 또는 영화/드라마 클립 (mp4). **컷편집 없음.** **TTS 안 씀.**
- **자막:** STT 원어 + LLM 번역 = 듀얼 자막. 시나리오 무관 `{original, translation}` 두 필드, 표시 여부는 채널/언어가 분기.
- **원어 (음원):** `en` `ko` `ja` / **번역 (시청자):** `ko` `ja` `th`
- **번역 자막**: 항상 노출(큰 글자). **원어 자막**: **영어 음원(`en`)일 때만 노출** (`showOriginal()` = `orig==="en"`). 한/일 음원은 번역만.
- **언어별 폰트** (`src/lang.ts`): ko=Pretendard/Noto Sans KR, ja=Noto Sans JP, th=Noto Sans Thai(+line-height 1.45), en=Inter. (system-native 폰트는 Chromium 렌더에서 안 잡혀 디스힙합도 Inter+NSJP 로 귀결 — preview=render 일치.)
- **상단 멘트 마크업:** 모든 채널 `**…**` → 굵게. `space_lab` 만 추가로 `[[…]]` → 빨강.

## 양산 워크플로

```bash
# 0) (선택) 직캠/저품질 오디오 + 깨끗한 음원 싱크 (prep-media 이전)
node tools/sync-av.mjs <video> <audio> [--trim-overlap]

# 0b) 원본을 공유 미디어로 임포트 (H.264 + 조밀 키프레임 + loudnorm + 사이드카)
node tools/prep-media.mjs ~/Downloads/song.mp4 my-song --kind music --title "곡명" --source "아티스트" --lang en

# 1) 영상 스캐폴드 — props.json + meta.json + source.mp4 심볼링크 + public 하드링크 + durationInFrames 자동
node tools/new-video.mjs goodvibesongs 076 --media my-song --title "곡명" --artist "아티스트" \
  --top-caption "전설의 도입부\n50년이 지나도 같은 떨림" --orig-lang en --trans-lang ko
#   채널별 추가 플래그: --media-kind / --media-title-ja (goodmovies, readyaction)
#                       --artist-track (thishiphop) / --bottom-cta --warn-text (space_lab)

# 2) STT (whisper.cpp 내장, 첫 실행 시 빌드+모델 다운로드). 항상 --language <원어>, .en 모델 금지.
node tools/transcribe.mjs videos/goodvibesongs/076/source.mp4 --language en   # [--model medium]
#   → videos/goodvibesongs/076/transcript.json

# 3) 자막 → props.json 의 captions
#   경로 A (영어 + 가사): script.txt 작성 후
node tools/align-script.mjs videos/goodvibesongs/076          # transcript + script → props.json captions
#   경로 B (비영어/의역/힙합/영화): Claude 가 transcript.json 을 phrase 단위로 묶고 번역해
#         videos/goodvibesongs/076/props.json 의 "captions" 배열을 채움 (번역 모호성 규칙 준수)
#   경로 C (SRT 받음): SRT cue 1:1 그대로 옮기고 번역만 추가 (타임스탬프 보정 금지)

# 4) 검증
node tools/check-captions.mjs videos/goodvibesongs/076    # 상단멘트/자막 오버플로 사전 감지 (넘치면 exit 1)
node tools/validate-props.mjs videos/goodvibesongs/076    # props/언어/duration/captions/심볼링크 정합성

# 5) 프리뷰 (채널 고정 포트)
node tools/preview.mjs goodvibesongs 076                  # http://localhost:3003, 목록에서 채널 선택
#   포트 점유 중이면 십의 자리 올려서: node tools/preview.mjs goodvibesongs 076 --port 3013

# 6) 렌더 → 결재본 (normalize 단계 없음)
mkdir -p output/goodvibesongs
npx remotion render src/index.ts goodvibesongs output/goodvibesongs/076.mp4 \
  --props=videos/goodvibesongs/076/props.json --public-dir=videos/goodvibesongs/076
#   space_lab 은 id 가 space-lab:
#   npx remotion render src/index.ts space-lab output/space_lab/076.mp4 \
#     --props=videos/space_lab/076/props.json --public-dir=videos/space_lab/076
```

### 번역 모호성 처리 (필수 — 프레임워크 무관)

번역 전에 transcript/script/meta 를 읽고 점검. STT 만으론 결정 안 되는 게 있으면 **추측 금지, `AskUserQuestion` 으로 한 번에 물을 것**: 존댓말/반말, 화자↔청자 관계, 화자 성별/연령(일본어 男/女言葉·종조사, 태국어 ครับ/ค่ะ), 격식/시대 톤, 감정 강도, 호칭, 고유명사 표기. 1인칭 사랑노래로 청자가 명확하면 묻지 않고 진행(반말 기본). 영화 대사처럼 관계가 영상에만 있으면 반드시 물을 것. `preview` 필드에 후보 번역을 넣어 비교 제시.

### 자막 파이프라인 규칙

- **렌더 전 `check-captions.mjs` 필수.** 상단멘트가 넘칠 것으로 추정되면(exit 1) 임의 수정 말고 사용자에게 물을 것: (1) 그 줄만 폰트 축소 (2) 문구 변경 (3) 두 줄 분리.
- **사용자 script(가사/대사)가 STT보다 텍스트 권위.** STT 는 타이밍 권위. STT 오인식 텍스트로 자막 만들지 말 것.
- **모든 자막 라인은 번역 필수.** 후렴/추임새/의성어도 타깃 언어로 음역(일=카타카나, 한=한글, 태=ฯ).
- whisper `.en` 모델 금지 — 비영어를 영어로 번역. 항상 `--language <원어>`. (transcribe.mjs 가 강제.)
- LCS(align-script)는 영어 음원에 최적. 일본어(띄어쓰기 없음)는 경로 B.
- caption `start/end` 는 초 단위. phrase 단위(5~10단어). 침묵 흡수 보정: 단어 간 갭 1초+ 면 자막 분리.

## 채널별 레이아웃 요약 (변경 금지 — 양산 일관성)

- **goodvibesongs**: 검정. 상 440 / 영상 1040(cover) / 하 440(빈). 멘트 55pt/500(**굵게 600). 자막 영상 중앙: 원어 34px italic(영어만) → 번역 46px/600 흰.
- **goodmovies**: 흰. 상 440 / 영상 1040 / 하 440. 멘트 48pt/600 검정(**800). 자막 영상 하단: 번역 40px/600 **노랑#FFEB3B**(검정 stroke) 위 → 원어 52px/800 흰(검정 stroke) 아래. 하단 `映画『제목』` 36px/300 회색.
- **readyaction**: 검정. 상 480 / 영상 960 / 하 480. 시리즈 고정 카피(default `歴代最高の**映画1000本を、**\n順不同で収集中`, **만 500). 자막 중앙: 원어 36px italic NSJP → 번역 48px/400 흰. 하단 `#번호`(40px italic) + `映画『제목』`(38px/200).
- **thishiphop**: 검정. 상 480 / 영상 960 / 하 480. 영상별 멘트(매번 물어볼 것, 전체 동일 굵기 49pt/500). 자막 중앙: 원어 36px italic → 번역 44px/600 흰. 하단 `#번호`(Inter 46px italic) + `Artist - Track`(Inter 44px/150).
- **space_lab**: 검정. **자막 없음.** 밴드 geometry 는 영상 비율로 `new-video` 가 자동 계산(`props.layout`). 헤드라인 60px/600(`[[빨강]]`+`**굵게800**`) / 영상 contain / 영상 아래 빨간 깜빡 경고 박스(끝 10초 전 등장 후 burst 반복) / 하단 고정 CTA 60px/600.

## 영상 식별 / 안전 영역

- 경로: `videos/<channel>/<number>/` (number 숫자, 3자리 권장). 결재본: `output/<channel>/<number>.mp4`.
- 3-band 레이아웃이 플랫폼 오버레이(좋아요/공유)를 자연히 피함 — 자막은 영상 영역 안.

## 도구 (`tools/`)

| 도구 | 역할 |
| --- | --- |
| `sync-av.mjs` | 직캠 오디오 ↔ 깨끗한 음원 onset 교차상관 정렬 + 먹싱 (프레임워크 무관, 원본 그대로) |
| `prep-media.mjs` | 원본 → `media/<slug>.mp4` 임포트 (트랜스코드+키프레임+loudnorm+사이드카, 원본 그대로) |
| `new-video.mjs` | 영상 스캐폴드: props.json/meta.json + source.mp4 심볼링크 + public 하드링크 + durationInFrames(마지막 프레임 pts) + space_lab layout 자동 계산 |
| `transcribe.mjs` | whisper.cpp STT → transcript.json (`@remotion/install-whisper-cpp`) |
| `align-script.mjs` | LCS 정렬 → props.json 의 captions (경로 A) |
| `check-captions.mjs` | 오버플로 사전 감지 (props.json + `channels.mjs` 레이아웃 상수) |
| `validate-props.mjs` | 렌더 전 정합성 검증 (hyperframes lint/validate 대체) |
| `preview.mjs` | 채널 고정 포트로 `remotion studio` (props + 미디어 자동) |
| `channels.mjs` | 채널 정의/기본 props/레이아웃 상수/space_lab layout 계산 (모든 도구 공유) |

> **`normalize-output` 없음** — Remotion 출력은 이미 SNS 안전(start_time 0). 절대 edit-list 정규화하지 말 것.

## Remotion 함정 (재발 방지)

1. **미디어는 영상 디렉토리의 `source.mp4` 하드링크 + 렌더 시 `--public-dir=영상디렉토리`.** 심볼링크는 Remotion 번들 복사에서 누락됨(404). `new-video` 가 하드링크 생성. media 슬러그 교체 시 재스캐폴드. **렌더할 때 `--public-dir` 를 빠뜨리지 말 것** (안 주면 staticFile("source.mp4") 404).
2. **Composition id 에 언더스코어 불가** → `space_lab` 의 id 는 `space-lab`.
3. **durationInFrames 는 마지막 프레임 pts 기준** (stream duration 아님). `new-video` 가 산정. 미디어 길이 바뀌면 재스캐폴드 또는 props.json 의 `durationInFrames` 수정.
4. **폰트는 `src/fonts.ts` 모듈 최상단 로드** (loadFont 가 render-blocking 내부 처리 — useEffect/delayRender 금지). 채널이 실제 쓰는 weight 만 배열에 둠 (요청 최소화). Google Fonts + Pretendard(jsDelivr CDN) 모두 원격 — `public/` 폰트 없음.
5. **preview·render 모두 같은 `--props`** → preview 와 render 가 항상 일치 (HyperFrames 의 "preview는 default만" 함정 없음).
6. **GL 렌더러 명시 금지** (`remotion.config.ts`). WebGL 미사용 — `angle` 은 CI(GPU 없음)에서 실패하고 메모리 누수. 기본값 사용.
7. **결정성**: `Math.random()`/`Date.now()` 금지 (병렬 렌더에서 프레임마다 달라짐). 애니메이션은 `useCurrentFrame()` 순수 함수 + `interpolate` 양끝 `clamp`.
8. **`--props` 는 top-level shallow merge** — 중첩 객체(예: space_lab `layout`)를 부분만 주면 형제 키가 사라짐. 중첩 객체는 통째로 줄 것 (`new-video` 가 완전한 props.json 을 씀).
