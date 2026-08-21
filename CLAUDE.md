# remotion-shorts

세로형 쇼츠(YouTube Shorts / Reels / TikTok) 양산용 — **Remotion(React) 판.** `hyperframes-shorts` 와 정확히 같은 역할(일본 타깃 5개 채널, 1080×1920 30fps, 컷편집 없는 자막 쇼츠)을 HyperFrames 대신 Remotion 으로 한다.

**채널별 컴포지션(`src/channels/`) + 영상별 props 격리(`videos/<ch>/<n>/props.json`) + 채널별·영상번호별 결재본 분리(`output/<ch>/<n>/`).**

## 채널 (5개)

| slug | 한국어 별명 | preview 포트 | Composition id | 비고 |
| --- | --- | --- | --- | --- |
| `goodvibesongs` | 굿바이브 | **3003** | `goodvibesongs` | 음악 + 듀얼 자막, 검정 배경. default en→ja |
| `goodmovies` | 굿무비 | **3004** | `goodmovies` | 영화 클립, 흰 배경 / 검정 멘트, 노란 번역. **레이아웃은 레디액션식**(시리즈 카피 + #(1000−번호) + 자막 세로중앙). default en→ja. **🌏 4개 언어** |
| `readyaction` | 레디액션 | **3005** | `readyaction` | 영화 클립, 검정 배경, 시리즈 카피 + #번호 + 영화 정보. default en→ja. **🌏 4개 언어** |
| `thishiphop` | 디스힙합 | **3006** | `thishiphop` | 힙합 트랙, 검정 배경, 영상별 멘트 + #번호 + 영문 Artist-Track. default en→ja |
| `space_lab` | 스페이스랩 | **3007** | `space-lab` | 정보 쇼츠, contain(잘림 X), 헤드라인 + 빨간 깜빡 경고 + 고정 CTA, **자막 없음**. default ja→ja. **🌏 4개 언어** |

> **🌏 = 다국어 채널.** 굿무비·스페이스랩·레디액션은 한 영상당 **일본어 / 대만(번체) / 태국어 / 베트남어 4개 결재본 + 캡션 4개**를 낸다.
> 나머지 2채널(굿바이브·디스힙합)은 일본어 1개. 아래 "🌏 다국어 양산" 참조.

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
│                             #   🌏 다국어 채널은 props.tw.json / props.th.json / props.vi.json 형제 파일 추가
│                             #      (source.mp4 는 4개 언어가 공유 — 하드링크·public-dir 그대로)
├── output/<ch>/<n>/          # 영상번호별 폴더. 결재본 <n>.mp4 + <n>캡션.txt + (굿바이브)<n>댓글/ + (있으면)<n>자막.srt 가 한곳에
└── output/<ch>-<lang>/<n>/   # 🌏 다국어: 언어별 최상위 폴더 분리. 안의 모양은 일본어 폴더와 동일
                              #   (<n>.mp4 + <n>캡션.txt — 파일명엔 접미사 없음, 번호는 전 국가 공통)
```

## 다른 컴퓨터에서 세팅 (clone 후)

레포엔 **코드만** 있고 미디어/바이너리(`media/*.mp4`, `node_modules/`, `whisper.cpp/`)는 제외돼 있다. 각자 환경에서 받거나 자동 생성된다.

1. `npm install` — 의존성(Remotion 등) 설치.
2. **(자막 쓸 때만)** 첫 `node tools/transcribe.mjs …` 실행 시 `whisper.cpp/` 가 **그 OS에 맞게 자동 빌드 + 모델 자동 다운로드**된다 (이후 캐시). 빌드 전제조건:
   - macOS: `xcode-select --install`
   - Linux: `cmake`, `build-essential`
   - 모델/버전 고정은 `--model`(기본 base) / `WHISPER_VERSION` 환경변수.
3. 원본 영상을 `media/` 에 넣고(또는 `node tools/prep-media.mjs` 로 임포트) `node tools/new-video.mjs <channel> <number> --media <slug> …` 로 스캐폴드.

> `whisper.cpp/` 를 깃에 올리지 않는 이유: 플랫폼 종속 **컴파일 바이너리**(다른 OS에선 실행 불가) + 모델 파일이 GitHub 100MB 제한 초과. `node_modules` 처럼 환경마다 새로 만드는 게 정상.

## 현재 스코프 / 다국어 / 자막 표시 규칙

- **인풋:** 음악 또는 영화/드라마 클립 (mp4). **컷편집 없음.** **TTS 안 씀.**
- **자막:** STT 원어 + LLM 번역 = 듀얼 자막. 시나리오 무관 `{original, translation}` 두 필드, 표시 여부는 채널/언어가 분기.
- **원어 (음원):** `en` `ko` `ja` / **번역 (시청자):** `ja` `tw` `th` `vi` `ko`
  (`tw` = 대만/번체중국어. **언어코드 = props 파일 접미사 = 결재본 접미사**로 통일 — `props.tw.json` → `047-tw.mp4` → `047캡션-tw.txt`)
- **번역 자막**: 항상 노출(큰 글자). **원어 자막**: **영어 음원(`en`)일 때만 노출** (`showOriginal()` = `orig==="en"`). 한/일 음원은 번역만.
- **출력은 그 나라 정서에 맞춘 현지어 (입력 언어 무관 — 필수).** 아래는 일본어 기준 서술이지만,
  다국어 채널의 `tw`/`th`/`vi` 판에도 **똑같이 적용**된다 — 일본어판을 직역하지 말고 그 나라 시청자 정서로 다시 쓴다. 상단 문구(멘트/헤드라인/카피)와 번역 자막의 **인풋이 한국어·영어·일본어 등 어떤 언어로 오든**, 직역이 아니라 **일본 시청자 정서에 맞게 자연스럽게 의역·현지화하여 일본어로** 작성한다. 사용자가 한국어로 준 상단 문구를 그대로 옮기지 말고, 일본 쇼츠 톤으로 다시 쓸 것. (타깃 5채널 전부 일본 — 고정댓글도 전부 일본어.)
- **언어별 폰트** (`src/lang.ts`): 출시 채널(hyperframes)이 웹폰트를 로드하지 않아 **맥 시스템 폰트**로 렌더된 룩을 그대로 재현한다. 각 스택은 **맥 시스템 폰트 우선 + 원격 웹폰트 폴백**(off-mac/CI 용): ja=**Hiragino Sans**(폴백 Noto Sans JP), en/라틴=**San Francisco**(`-apple-system`, 폴백 Inter), ko=**Apple SD Gothic Neo**(폴백 Pretendard/Noto Sans KR), th=**Thonburi**(폴백 Noto Sans Thai, +line-height 1.45). ⚠️ Remotion 렌더는 **맥 시스템 폰트를 정상적으로 사용한다**(과거 "Chromium 렌더에서 안 잡힌다"는 메모는 오류였음 — 레퍼런스와 픽셀 일치 확인). **맥에서 렌더해야 출시본과 100% 동일**; 비-mac 에선 폴백 웹폰트로 근사 렌더.
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
#   ⓘ STT 직후 transcribe 가 무보컬(간주) 구간을 자동 검출해 출력한다(detect-gaps 내장).
#     음악은 whisper 가 간주에 토큰을 "늘려서" 환각(한 글자 ~1s)하는데, 그 구간이 곧 자막을 비울 곳.
#     캡션(3단계 경로 B/C) 작성 시 **그 gap 구간엔 caption 을 두지 말 것**(간주에 자막 연속 방지 — 088 교훈).
#     단독 재실행/튜닝: node tools/detect-gaps.mjs videos/goodvibesongs/076 [--hold 0.9] [--min-gap 1.0]
#     (제안일 뿐 props 자동수정 안 함. 짧은 곡간 쉼·인트로 침묵은 못 잡을 수 있으니 프리뷰로 최종 확인.)

# 3) 자막 → props.json 의 captions
#   경로 A (영어 + 가사): script.txt 작성 후
node tools/align-script.mjs videos/goodvibesongs/076          # transcript + script → props.json captions
#   경로 B (비영어/의역/힙합/영화): Claude 가 transcript.json 을 phrase 단위로 묶고 번역해
#         videos/goodvibesongs/076/props.json 의 "captions" 배열을 채움 (번역 모호성 규칙 준수)
#   경로 C (SRT 받음): SRT cue 1:1 그대로 옮기고 번역만 추가 (타임스탬프 보정 금지, cue 묶기 절대 금지)

# 4) 검증
node tools/check-captions.mjs videos/goodvibesongs/076    # 상단멘트/자막 오버플로 사전 감지 (넘치면 exit 1)
node tools/validate-props.mjs videos/goodvibesongs/076    # props/언어/duration/captions/심볼링크 정합성

# 5) 프리뷰 (채널 고정 포트)
node tools/preview.mjs goodvibesongs 076                  # http://localhost:3003/goodvibesongs
#   ⚠️⚠️ 점유 중인 프리뷰 포트는 절대 kill 하지 말 것 (사용자가 다른 프리뷰를 보고 있을 수 있음).
#        점유 중이면 십의 자리를 올려 빈 자리로 들어간다: 3003 차있으면 3013, 그것도 차있으면 3023…
#        먼저 `for p in 3003 3013 3023 3033; do lsof -ti :$p; done` 로 빈 포트를 찾고 --port 로 지정:
#        node tools/preview.mjs goodvibesongs 076 --port 3023
#        (정리 단계에서 kill 하는 건 내가 띄운 그 포트만 — 7-b 참조. 남의 프리뷰 포트는 건드리지 않는다.)
#   ⚠️ 사용자에게 안내하는 URL 엔 반드시 채널 경로를 붙일 것: http://localhost:<포트>/<composition-id>
#      루트(http://localhost:<포트>)로 열면 항상 기본 채널(goodvibesongs)로 빠진다 (엉뚱한 채널).
#      composition-id 는 slug 와 같되 space_lab 만 space-lab → http://localhost:<포트>/space-lab

# 5b) 🌏 다국어 채널(굿무비·스페이스랩)만 — **일본어 프리뷰 승인 후** 3개 언어 파생
node tools/derive-lang.mjs videos/space_lab/047          # props.tw/th/vi.json 생성 (텍스트는 아직 일본어)
#   → Claude 가 각 파일의 topCaption/warnText/bottomCTA/captions/mediaTitleJa 를 현지화 의역으로 채운다
node tools/check-captions.mjs videos/space_lab/047 --lang tw   # 4개 언어 전부 통과해야 함
node tools/validate-props.mjs videos/space_lab/047 --lang tw
node tools/preview.mjs space_lab 047 --lang tw --port 3017     # (선택) 언어별 프리뷰
#   ⚠️ 일본어를 나중에 고쳤으면 반드시: node tools/derive-lang.mjs <dir> --sync
#      (durationInFrames/layout/caption 타임스탬프 등 구조 필드만 재동기화, 번역문은 보존)

# 6) 렌더 → 결재본 (normalize 단계 없음).
node tools/render.mjs goodvibesongs 076              # 단일 언어 채널 → output/goodvibesongs/076/076.mp4
node tools/render.mjs space_lab 047                  # 다국어 → output/space_lab[-tw|-th|-vi]/047/047.mp4
node tools/render.mjs readyaction 952 --langs tw,th,vi   # 일본어판이 이미 있으면 나머지만
#   --only-missing 로 이미 있는 결재본은 스킵
#   render.mjs 가 composition id 변환(space_lab→space-lab), --props/--public-dir, mkdir,
#   그리고 **렌더 직전 check-captions 자동 게이트**(넘치면 그 언어는 렌더 안 함)까지 처리한다.
#   수동으로 돌릴 때(참고):
#   npx remotion render src/index.ts space-lab output/space_lab/047/047-tw.mp4 \
#     --props=videos/space_lab/047/props.tw.json --public-dir=videos/space_lab/047

# 7) 정리 (마지막 스텝, 필수) — 결재본(output) + <번호>캡션.txt 확정된 뒤에만.
#   a) 이번 작업의 원본 소스 삭제 — 사용자가 최상단(레포 루트)에 처음 준 그 영상 파일 (예: 956소스.mov).
#      ⚠️ 이번 영상 것만. 다른 작업의 소스(951소스.mov 등)는 절대 건드리지 말 것. media/<slug>.mp4(공유 임포트본)도 지우지 말 것.
#   b) 프리뷰 스튜디오 kill — 5)에서 --port 로 내가 실제 띄운 그 포트만 (기본 채널포트라고 단정 말 것).
#      lsof -ti :<내가_쓴_포트> | xargs kill   (예: 3023 에 띄웠으면 lsof -ti :3023). 다른 프리뷰 포트는 건드리지 않는다.
#   c) (굿바이브 한정) <번호>댓글/ 폴더는 삭제하지 말고 그 영상의 결재본 폴더 안으로 이동 — mv "<번호>댓글" output/goodvibesongs/<번호>/
#      (한국어 파일명 댓글 스샷 + manifest 보존. 나중에 재현/수정 가능)
rm -f "956소스.mov"; lsof -ti :3005 | xargs kill 2>/dev/null
# 굿바이브 예: mv "085댓글" output/goodvibesongs/085/
```

### 결재본 캡션 + 고정댓글 (output 나올 때 자동 생성)

**결재본(`output/<채널>/<번호>/<번호>.mp4`)이 새로 렌더되면, 같은 번호 폴더(`output/<채널>/<번호>/`) 안에 `<번호>캡션.txt` 도 항상 함께 만든다.** 사용자가 따로 "캡션도"라고 안 해도 자동. (Remotion 판은 normalize 단계가 없으니 render 직후가 타이밍.) — **결재본·캡션·댓글·자막 등 한 영상의 산출물은 전부 그 번호 폴더 안에 모은다.**

- **파일명:** `<번호>캡션.txt` (예: 072번 → `072캡션.txt`), 위치는 `output/<채널>/<번호>/`. 결재본에 별명/접미사가 붙어도 **번호만** 써서 `083캡션.txt`.
- **🌏 다국어 채널(굿무비·스페이스랩·레디액션)은 캡션도 4개** — 각 언어 폴더(`output/<ch>-<lang>/<번호>/`) 안에 `<번호>캡션.txt`.
  본문·고정댓글 전부 해당 언어로 **재작성**(직역 금지), **@핸들만 그대로**. 굿무비 IMDb 평점은 일본어판에서 한 번만 검색해 4개가 공유.
  언어별 고정댓글 표와 추천 문단 문형은 [tools/jp-caption-writer.md](./tools/jp-caption-writer.md) "다국어" 절 참조.
- **내용 순서:** 한 파일에 **캡션 → 구분선 → 고정댓글**. 포맷·채널별 캡션 작성 규칙·CTA 트렌드는 **[tools/jp-caption-writer.md](./tools/jp-caption-writer.md)** (= `/캡션` 스킬과 동일 내용) 참조. **굿무비만** IMDb 평점을 캡션에 넣으므로 그 수치만 **웹 검색으로 실값 확인** 후 기입(레디액션 등 다른 영화 채널은 평점 표기 안 함 — 불필요한 검색 금지).
- **굿무비 캡션 후반부에 '추천 문단' 필수(레디액션식).** 굿무비 채널 본질이 '영화 추천'이므로, 캡션 후반에 `そして、第〈번호〉作目のおすすめは、この『작품명』。その理由は、〜` 형식으로 추천 이유 2~3문장을 넣는다(번호=영상 번호). 상세는 jp-caption-writer.md 굿무비 구조 참조.
- **굿무비 고정댓글 앞에 '명작 선정 이유' 문단 필수 (2026-07-29 추가, 레디액션식).** 굿무비 고정댓글은 아래 고정 문구 **그대로** 두되, 그 **위에** 한 문단을 덧붙인다: `✨この映画が「名作映画1000選」に選ばれた理由、それは"<핵심 문구>"にある。` + 왜 명작인지 2~3문장(결말 스포 금지). 즉 굿무비 고정댓글 = **선정 이유 문단 → 빈 줄 → 고정 문구**.
- **고정댓글은 채널별 고정 문구** — 요청 없으면 아래 그대로(변형 금지):

| 채널 | 고정댓글 |
| --- | --- |
| 굿바이브 | `皆さんはただ待っているだけで大丈夫です。 私が自ら素敵な曲を毎日探してお届けします😊 フォローしておくだけで、フィードまで「配送」いたします！` |
| 굿무비 | (위 '명작 선정 이유' 문단 + 빈 줄 +) `もっと多くの映画の名シーンを見たいなら@goodmovies_rekoフォローしてチェックしてみてください😊` |
| 레디액션 | `人生に美しい余韻を残す「1000本の名作映画」をここに。フォローして、あなたのフィードを小さな映画館にしてみませんか？次の週末に観たい特別な1本を、@readyaction_movies をフォローして見つけてみてください🎞️` |
| 스페이스랩 | `日常の疑問から宇宙の神秘まで、もっと面白い科学の話が見たいなら @space_lab.note をフォロー！🪐🧪` |
| 디스힙합 | `フォローすれば、毎日イケてるヒップホップが聴けるぜ skrrr🤙🏾` |

파일 포맷(요지):

```
[별명] <번호> | <소재>

〔キャプション〕
(3문단 일본어 캡션)


━━━━━━━━━━━━━━━ 📌 固定コメント ━━━━━━━━━━━━━━━

(위 표의 채널 고정댓글)
```

### 번역 모호성 처리 (필수 — 프레임워크 무관)

번역 전에 transcript/script/meta 를 읽고 점검. STT 만으론 결정 안 되는 게 있으면 **추측 금지, `AskUserQuestion` 으로 한 번에 물을 것**: 존댓말/반말, 화자↔청자 관계, 화자 성별/연령(일본어 男/女言葉·종조사, 태국어 ครับ/ค่ะ), 격식/시대 톤, 감정 강도, 호칭, 고유명사 표기.

**🌏 다국어판에서 추가로 걸리는 것** (한 번에 같이 물을 것 — 언어마다 따로 묻지 말 것):
- **베트남어 인칭대명사**: 화자↔청자 관계가 대명사에 그대로 박힌다(`anh/em` 연인·연상연하, `mình/bạn` 대등,
  `tôi` 격식, `tớ/cậu` 친구). 영화 대사는 관계가 영상에만 있으므로 **반드시 확인**. 일본어판에서 이미 관계를 확정했으면 재사용.
- **번체중국어 `你` vs `妳`**: 청자가 여성이면 `妳` 를 쓰는 게 대만 자막 관습. 청자 성별을 모르면 물을 것.
- **작품명 현지 개봉 제목**: `mediaTitleJa`(=표시용 제목)에 그 언어권 실제 개봉 제목을 넣는다.
  대만 개봉명이 있으면 그것(예: Normal People → 《正常人》), 없으면 원제 유지. 임의 번역 금지. 1인칭 사랑노래로 청자가 명확하면 묻지 않고 진행(반말 기본). 영화 대사처럼 관계가 영상에만 있으면 반드시 물을 것. `preview` 필드에 후보 번역을 넣어 비교 제시.

### 자막 파이프라인 규칙

- **렌더(`remotion render`)는 반드시 프리뷰 승인 후에만.** 렌더는 무거운 작업이라 바로 돌리지 말 것. check-captions/validate-props 통과 → **승인용 프리뷰는 Claude 가 직접 `tools/preview.mjs` 로 스튜디오를 띄워서** 사용자에게 자막/레이아웃을 보여주고 명시적 승인을 받은 뒤 렌더한다. 승인 전 렌더 금지. (스틸 프레임 추출만으로 승인 대체 금지 — 사용자가 직접 재생/확인할 수 있게 프리뷰 서버를 항상 띄울 것. **안내 URL 엔 반드시 채널(composition-id) 경로를 붙일 것**: `http://localhost:<포트>/<composition-id>` — 루트 URL 은 항상 기본 채널(goodvibesongs)로 빠지므로 절대 루트로 안내하지 말 것. `space_lab` 만 경로가 `space-lab`.)
- **렌더 전 `check-captions.mjs` 필수.** 상단멘트가 넘칠 것으로 추정되면(exit 1) 임의 수정 말고 사용자에게 물을 것: (1) 그 줄만 폰트 축소 (2) 문구 변경 (3) 두 줄 분리.
- **사용자 script(가사/대사)가 STT보다 텍스트 권위.** STT 는 타이밍 권위. STT 오인식 텍스트로 자막 만들지 말 것.
- **SRT 받으면 cue 를 절대 묶지 말 것 (경로 C).** SRT 의 cue 분할은 사용자가 자막 텀(끊는 타이밍)을 의도해서 직접 나눈 것 → `cue 수 = caption 수`, 타임스탬프 무보정. 일본어 어순/문법 때문에 한 cue 직역이 어색하면 **1:1 단어 대응이 안 되더라도 한 문장을 여러 cue 에 나눠 담아** 자연스럽게 흐르게 한다(예: `there's / something for you / in my bag` → `実はね / 君へのプレゼントが / 僕のバッグにもあるんだ`). 묶기는 금지, 분할(어순)은 허용. 짧은 cue 도 그대로 둘 것 — 타임스탬프를 늘려 맞추지 말 것.
- **자막 ease(페이드) 없음 — 하드컷 (2026-07-29 폐지, 전 채널 공통).** `CaptionTrack` 은 `[start, end)` 구간에만 그리고 그 밖에선 렌더하지 않는다. 페이드 인/아웃 없음, `fadeSeconds` prop 은 무시(호환용 잔재). 자막이 보컬보다 0.1~0.4s 먼저 뜨는 게 신경 쓰이면 페이드를 되살리지 말고 caption `start` 를 조정할 것.
- **모든 자막 라인은 번역 필수.** 후렴/추임새/의성어도 타깃 언어로 음역(일=카타카나, 한=한글, 태=ฯ).
- whisper `.en` 모델 금지 — 비영어를 영어로 번역. 항상 `--language <원어>`. (transcribe.mjs 가 강제.)
- LCS(align-script)는 영어 음원에 최적. 일본어(띄어쓰기 없음)는 경로 B.
- caption `start/end` 는 초 단위. phrase 단위(5~10단어). 침묵 흡수 보정: 단어 간 갭 1초+ 면 자막 분리.
- **원본에 원어 자막이 박힌 영상(번역만 오버레이, `original:""`):** `original` 을 비워 번역만 그린다(중복 방지). 굿무비는 2026-07-29 개편으로 자막이 **영상 세로 중앙 고정**이라 `captionPaddingTop` 조정은 더 이상 하지 않는다(폐기 — 스키마 호환용으로만 남음). still 1컷 떠서 박힌 영문과 겹치는지 확인하고, 겹치면 크롭/구도로 해결할 것. (구 방식 선례: 굿무비 084=아래, 081=위.)

## 채널별 레이아웃 요약 (변경 금지 — 양산 일관성)

- **goodvibesongs**: 검정. 상 440 / 영상 1040(cover) / 하 440. 멘트 55pt/300(**굵게 400, 영상 쪽으로 하단패딩 30). 자막 영상 중앙에서 **아래로 70px**(`CAPTION_Y_OFFSET`, 2026-07-29 조정): 원어 34px italic(영어만) → 번역 46px/400 흰. **워터마크 고정**(아래 참조). **하단(선택): 댓글 오버레이** — 영상 바로 밑 16px 틈 + 가운데, 내용 길이대로 폭 가변(원본 px×scale, maxWidth 1020 캡), 항상 1개 연속 노출. → 아래 "굿바이브 댓글 오버레이" 참조.
  - **⚠️ 굿바이브 워터마크는 채널 고정 (101 확정본, 2026-07-29 — 영상별로 바꾸지 말 것):**
    `props.watermark = { "text": "@goodvibesongs.mp3", "y": 0.375, "size": 17, "opacity": 0.45, "weight": 500 }`
    영상 밴드(top 440 / h 1040) 안 37.5% 지점 = 화면 y 830px, 라틴 폰트(SF) 흰색 17px. 자막(중앙+70px)보다 위라 안 겹침.
    `new-video.mjs` 가 굿바이브 스캐폴드 시 **자동 주입**하므로 새 영상엔 수작업 불필요. 표준값은 `tools/channels.mjs` 의 `GOODVIBE_WATERMARK` + `src/props.ts` `watermarkSchema` default 두 곳 미러 — **한쪽만 고치지 말 것.** 워터마크는 굿바이브 전용(다른 채널 스키마엔 없음).
- **goodmovies**: 흰. **(2026-07-29 개편 — 레이아웃은 레디액션식, 색만 굿무비 유지.)** 상 480 / 영상 960 / 하 480. 상단은 **시리즈 고정 카피**(default `死ぬまでに観たい**名作映画**\n**1000本を、**順不同で紹介中`, 50pt/200 검정, **만 500 — 영상별 멘트 아님, 매번 묻지 말 것). 자막 **영상 세로 중앙**: 원어 36px italic NSJP 흰(검정 stroke, 영어 음원만) 위 → 번역 48px/400 **노랑#FFEB3B**(검정 stroke) 아래. 하단 `#번호`(40px italic 검정) + `映画『제목』`(38px/200 검정 0.72) — **`#번호` = 1000 − 영상번호**(예 090 → `#910`, `new-video` 자동 주입).
  - 개편 전 영상(073~084)은 상 440/영상 1040 + 자막 영상 하단 + `captionPaddingTop` 이었다. `captionPaddingTop` 은 **폐기**(스키마에만 호환용으로 남음) — 새 영상엔 쓰지 말 것.
  - **⚠️ 굿무비 자막 워크플로 — "영문 박힌 영상 + SRT" (경로 C 변형):** 굿무비는 **영어 자막이 영상에 이미 박혀 있는** 클립 + **사용자 SRT(`<번호>자막.srt`)** 조합이 흔하다. 이때:
    - **SRT 는 타이밍·영문 텍스트의 권위.** cue 1:1 그대로(묶기 금지, 타임스탬프 무보정 — 경로 C).
    - **영문이 화면에 박혀 있으면 `original` 을 비운다**(중복 방지) → `{ start, end, original: "", translation: "<일본어>" }`. 이 경우 세로 중앙엔 노란 번역만 뜬다.
    - **영문이 안 박힌 클립**(SRT 만 받은 경우 — 090 선례)이면 `original` 에 SRT 영문을 그대로 넣어 **원어(흰 이탤릭) 위 / 번역(노랑) 아래** 듀얼 자막으로 간다.
    - **검정 여백 크롭:** 영상 가장자리에 단순 검정 레터박스나 상단 밈 텍스트가 함께 들어온 경우, 그 검정 부분은 잘라내 콘텐츠만 남긴다 — `ffmpeg -vf cropdetect` 로 콘텐츠 박스를 잡아 크롭한 뒤 `prep-media` 로 임포트(라운드 코너는 cover 크롭이 흡수). **박힌 영문 자막은 콘텐츠 안**이므로 그대로 남긴다(자르지 말 것).
- **readyaction**: 검정. 상 480 / 영상 960 / 하 480. 시리즈 고정 카피(default `歴代最高の**映画1000本を、**\n順不同で収集中`, **만 500). 자막 중앙: 원어 36px italic NSJP → 번역 48px/400 흰. 하단 `#번호`(40px italic) + `映画『제목』`(38px/200).
- **thishiphop**: 검정. 상 480 / 영상 960 / 하 480. 영상별 멘트(매번 물어볼 것, 전체 동일 굵기 49pt/**400**). 자막 중앙: 원어 36px italic/**400** → 번역 44px/**500** 흰. 하단 `#번호`(Inter 46px italic/**300**) + `Artist - Track`(Inter 44px/**100**, 흰 **opacity 0.65**). (2026-06-22 전 텍스트 한 단계씩 얇게 + Artist-Track 연하게 — 양산 표준.)
- **space_lab**: 검정. **자막 없음.** 밴드 geometry 는 영상 비율로 `new-video` 가 자동 계산(`props.layout`). 헤드라인 60px/600(`[[빨강]]`+`**굵게800**`) / 영상 contain / 영상 아래 빨간 깜빡 경고 박스(끝 10초 전 등장 후 burst 반복) / 하단 고정 CTA 60px/600.
  - **⚠️ space_lab 여백/상하단 문구 크롭 (양산 표준 — 굿무비와 동일, 무조건 적용):** space_lab 은 `contain`(잘림 X)이라 원본의 레터박스·상/하단 문구 밴드가 그대로 영상 밴드 안에 노출된다. 그래서 **임포트 전에 항상 상하좌우 단색 여백 + 상/하단 문구 밴드를 잘라내 콘텐츠만 남긴다** → 크롭한 뒤 `prep-media` 로 임포트. 크롭으로 비율이 바뀌어도 `new-video` 가 layout(`props.layout`)을 자동 재계산하므로 추가 수작업 없음.
    - **여백 색은 검정일 수도 흰색일 수도(또는 다른 단색) 있다 — "검정 밴드"로 단정하지 말 것.** 먼저 still 1컷을 떠서 여백/문구 밴드의 색을 눈으로 확인하고 그에 맞게 크롭한다:
      - 검정 여백 → `ffmpeg -vf cropdetect` (기본은 검정 기준) 로 콘텐츠 박스 산정.
      - 흰색/밝은 단색 여백 → cropdetect 가 검정만 잡으므로 `-vf "negate,cropdetect"` 로 반전 후 박스를 잡거나, still 에서 콘텐츠 경계 픽셀을 재서 `crop=w:h:x:y` 를 직접 지정. (negate 는 측정용일 뿐 — 실제 출력 크롭엔 negate 없이 그 박스만 적용.)
    - **단, 문구가 단색 밴드가 아니라 콘텐츠/그래픽 위에 바로 얹혀 있어** 크롭하면 그래픽까지 잘리는 경우엔 임의로 자르지 말고 **still 1컷 떠서 사용자에게 확인 후 진행**(굿무비가 박힌 영문 자막을 콘텐츠로 보고 남기는 것과 같은 판단).
    - **⚠️ 잘라낸 원본 상단문구는 버리지 말고 헤드라인 소스로 쓴다:** 크롭 전 still 에서 원본 상/하단에 박혀 있던 문구(헤드라인/제목)를 읽어, 그 의미를 참고해 **헤드라인을 직접 작성**한다 — 직역이 아니라 **일본 시청자 정서에 맞게 자연스럽게 의역·현지화한 일본어**로(상단 멘트 전역 규칙과 동일). 원본이 한국어·영어든 일본어로 재작성하고, **원본이 이미 일본어면 톤·길이만 다듬어 유사하게** 쓴다. 별도 지시 없으면 사용자에게 매번 묻지 말고 이 원본 문구를 근거로 알아서 작성(`[[빨강]]`/`**굵게**` 마크업은 강조할 핵심어에 적용).

## 🌏 다국어 양산 (굿무비 · 스페이스랩 · 레디액션)

세 채널은 한 영상당 **일본어 / 대만(번체, `tw`) / 태국어(`th`) / 베트남어(`vi`) 4개 결재본 + 캡션 4개**를 낸다.

**입력 구조:** `props.json` 이 **일본어 베이스**, 변형은 같은 디렉토리의 형제 파일 `props.<lang>.json`.
`source.mp4` 하드링크와 `--public-dir` 는 4개 언어가 공유하므로 추가 미디어 복사가 없다.
무플래그 호출(`check-captions <dir>` 등)은 예전 그대로 베이스만 본다 — 기존 영상 무영향.

**⚠️ 출력 구조: 언어별로 최상위 폴더를 분리하고, 영상번호는 전 국가 공통으로 통일한다.**

```
output/readyaction/952/952.mp4      + 952캡션.txt   ← 일본어(베이스, 기존 그대로)
output/readyaction-tw/952/952.mp4   + 952캡션.txt   ← 대만
output/readyaction-th/952/952.mp4   + 952캡션.txt   ← 태국
output/readyaction-vi/952/952.mp4   + 952캡션.txt   ← 베트남
```

**폴더가 언어를 나타내므로 파일명엔 언어 접미사를 붙이지 않는다.** 각 언어 폴더가 일본어 폴더와
똑같은 모양이라 나라별로 통째로 넘기기 쉽다. **같은 영상은 어느 나라든 같은 번호** — 번호를 나라별로
따로 매기지 말 것(관리 편의, 사용자 지시 2026-08-10). `tools/render.mjs` 가 이 경로를 자동으로 만든다.

**순서 (반드시 이 순서):**
1. 일본어로 props 완성 → `check-captions` → **프리뷰 승인**
2. `node tools/derive-lang.mjs videos/<ch>/<n>` → `props.tw/th/vi.json` 생성
3. Claude 가 각 파일의 텍스트를 **현지화 의역**으로 채움 (직역 금지)
4. `check-captions --lang` 4개 전부 통과
5. `node tools/render.mjs <ch> <n>` → 4개 렌더 + 캡션 txt 4개

**번역 대상 (화면에 나오는 것 전부):** 헤드라인/상단 멘트, `warnText`, `bottomCTA`, `captions[].translation`,
`mediaTitleJa`(= 그 언어권 개봉 제목). `videoNumber`·`layout`·타임스탬프는 구조 필드라 그대로.

**⚠️ 길이가 언어마다 크게 다르다 — 문구를 그대로 옮기면 넘친다.**
같은 뜻이 라틴 문자(베트남어)는 CJK 대비 **약 1.35배**, 태국어는 **약 1.15배** 넓다.
스페이스랩 헤드라인 60px 기준으로 일본어에서 딱 맞던 줄이 베트남어에선 그냥 터진다 →
**번역할 때부터 짧게 쓰고, `check-captions --lang` 을 반드시 통과시킬 것.**
`TopCaption` 은 넘쳐도 자동 축소가 없고 위로 밀려 잘리기만 한다(안전망은 check-captions 뿐).

**⚠️ 일본어를 나중에 고쳤으면 `derive-lang.mjs --sync`.**
`durationInFrames` / `layout` / caption 타임스탬프 같은 구조 필드만 베이스에서 다시 덮어쓰고 번역문은 보존한다.
caption 개수가 다르면 에러 — **cue 1:1 대응은 전 언어 공통 불변식**.

**타이포 규칙 (자동):** 음수 트래킹과 `palt` 는 CJK(ja/tw)에만, 태국어·베트남어는 0.
태국어는 `word-break: keep-all` 이면 띄어쓰기가 없어 줄이 안 꺾이므로 `normal`.
전부 `src/lang.ts` 의 `letterSpacingFor` / `paltFor` / `wordBreakFor` / `scriptLineHeight` 가 언어로 분기 — 컴포넌트에 하드코딩 금지.

**폰트:** ja=Hiragino Sans / tw=**PingFang TC**(폴백 Noto Sans TC) / th=Thonburi(폴백 Noto Sans Thai) /
vi=San Francisco(폴백 Inter, `vietnamese` subset 필수 — 없으면 성조부호가 깨진다).

---

## 굿바이브 댓글 오버레이 (goodvibesongs 전용)

굿바이브 하단 검정(영상 바로 밑 440px)에 **유튜브 댓글 스크린샷**을 타이밍 맞춰 띄운다. 가사 반응 댓글로 몰입 + 팔로우 유도. `props.comments` 배열(`src/props.ts` `commentSchema`). 다른 채널엔 없음.

**입력 (사용자가 줌):** 레포 루트에 **`<번호>댓글/`** 폴더 (영상 소스처럼 최상단). 그 안에 댓글 스샷들(png). 파일명은 아무거나(스크린샷 원본명).

**⚠️ 작업 순서: STT → 자막(captions) 확정 → 그 다음 댓글 매칭.** 댓글 `anchor` 는 확정된 caption 시점(초)에 맞추므로, 자막을 먼저 끝낸 뒤 댓글을 배치할 것.

**워크플로:**
1. 사용자가 `<번호>댓글/` 에 댓글 스샷을 넣어줌 (각 1댓글 크롭, 검정 배경 유튜브 댓글). 파일명은 원본 스샷명 그대로.
2. **⚠️ 스샷 스케일 확인 → 1x 면 2x 업스케일 (댓글 "크기"의 문제).** 화면 표시 폭 = **원본 px × COMMENT_SCALE**(maxWidth 1020 캡). 즉 **저해상 스샷이면 화면에서도 작게** 나온다. 판단: **폭이 대체로 <500px** 면 1x 다 → 전부 2x 로 올린다(`ffmpeg -i in.png -vf "scale=iw*2:ih*2:flags=lanczos" out.png`, 제자리 덮어쓰기). **COMMENT_SCALE(채널 공통 상수)은 건드리지 말 것 — 다른 영상까지 영향.**
   ⓘ **블러는 스케일 무관** — 2026-08-21 개정으로 blur-comments 가 스샷마다 지오메트리를 자동 측정한다. 업스케일은 순전히 화면 크기 때문이지 블러 정확도 때문이 아니다.
3. **Claude 가 각 스샷을 분석:**
   - **(필수) 각 스샷 파일명을 댓글 내용의 한국어 번역으로 바꾼다** — `mv "스크린샷 ….png" "마음에 꽂힌다 멘탈 정화됨.png"`. **이 파일명이 곧 그 댓글의 제목/식별자**(어느 댓글인지·어느 가사에 붙일지 판단용, 화면엔 미표시). 파일명 안전: `/ : ? *` 같은 문자 빼고, 일본어 댓글이면 자연스러운 한국어로.
   - 그 다음 `manifest.json` 작성 (file = 바뀐 한국어 파일명). **handleEnd 는 생략 — prep 가 자동 측정한다:**
   ```json
   [{ "file": "여기부터 너무 좋아.png", "anchor": 66 }]
   ```
   - `handleEnd`(선택, **기본 자동**): @핸들 끝 x좌표(블러 닉네임 폭). **닉네임=흰색·날짜=회색**이라 blur-comments 가 핸들 줄에서 **흰색(luma>200) 픽셀의 최대 x 를 스캔해 자동 산정**(회색 날짜는 자동 제외). **그리드로 눈대중 측정하지 말 것 — 폐지.** 자동값이 어쩌다 틀린 예외 스샷만 manifest 에 숫자로 직접 줘서 덮어쓴다.
   - `anchor`(선택): 그 댓글이 **합당한 가사 시점(초)**. 특정 가사/장면을 가리키는 댓글이면 그 caption `start` 초를 넣음. 전체 어디든 가능한 일반 댓글이면 생략.
   - `note`(선택): 안 주면 prep-comments 가 **파일명(=한국어 번역)을 note 로** 자동 사용. 굳이 따로 줄 필요 없음.
4. `node tools/prep-comments.mjs <번호>` — 지오메트리 자동측정 + 블러 + `videos/goodvibesongs/<번호>/comments/NN.png` 복사 + 타이밍 분배 + `props.json` 의 `comments` 기록 + 원본 px(`w`) 기록. 로그에 스샷별 `프사 WxH / 닉 WxH block=N sigma=N` 출력 — **여기 숫자가 튀는 스샷이 있으면 그 장만 눈으로 확인할 것.**
5. `node tools/preview.mjs goodvibesongs <번호>` 로 승인 → 렌더.

**블러 레시피 (2026-08-21 개정 — "자동 지오메트리 + 모자이크". 110에서 핸들이 읽혀 전면 교체):** `blur-comments.mjs` 가 적용.

- **스샷마다 스스로 잰다 — 고정 좌표 없음.** 예전 레시피는 `프사 x0 y0 90×90`, `닉 x82 y6 …×42` 같은 **레티나(2x) 고정 좌표**였다. 실제 스샷은 1x~2x 가 섞여 들어와(110은 줄높이 25~29px) 마스크가 헐겁게 얹혔다. 지금은 다음을 측정한다:
  - `textLeft` = 핸들·본문·액션(좋아요/返信) 줄의 공통 들여쓰기 x. 세 줄 모두 같은 x 에서 시작하고 **밝은 프사는 그 줄의 minx 를 작게만** 만들므로 **여러 줄 minx 의 최댓값**이 참값이다. (중앙값을 쓰면 세로로 긴 밝은 프사에 끌려간다 — 105/107 사례.)
  - `lineH` = **텍스트 칼럼(x ≥ textLeft) 안에서만** 잰 줄 높이 중앙값. 전체 폭으로 재면 세로로 긴 프사가 줄들을 이어붙여 lineH 가 50↑ 으로 뻥튀기되고, 그만큼 마스크가 본문까지 덮는다.
  - `handleEnd` = 핸들 줄의 흰색(>200) 최대 x. 날짜는 회색(~170)이라 자동 제외 — **임계값 200 고정**(내리면 날짜까지 먹는다).
  - 프사 bbox = textLeft 왼쪽에서 배경보다 밝은(>45) 픽셀. **그 행에 밝은 픽셀이 일정 개수 이상인 행만** 인정하고 가장 긴 연속 구간을 취한다(스레드 가이드선 같은 1~2px 세로 잔선 무시). 검출 결과는 "핸들 줄 위 ~ +2.1줄" 하한 박스와 **합집합** — 아스키아트 댓글처럼 프사 칼럼에 본문이 삐져나와도 프사 아랫부분이 노출되지 않는다.
- **강도도 lineH 에서 파생:** 모자이크 블록 `≈lineH×0.85` → 가우시안 `sigma≈lineH×0.6`, 페더 `≈lineH×0.12`. **모자이크를 먼저 거는 게 핵심** — 가우시안만으로는 sigma 를 올려도 글자 윤곽 잔상이 남는다.
- **⚠️ 마스크는 그릴 때 `1.5×feather` 만큼 부풀린 뒤 blur 한다 (110 사태의 진짜 원인).** 흰 박스를 그대로 blur 하면 박스가 얇을수록(닉 줄 ~35px, feather 5) 가장자리 그라데이션이 **박스 안쪽까지 파고들어 내부 알파가 255 에 도달하지 못한다** → 블러가 반투명으로 얹혀 원본 글자가 그대로 비친다. sigma 를 아무리 올려도 안 지워지던 이유가 이것. 부풀리면 의도한 박스 전체가 알파 255 평지가 되고 페더는 **바깥으로만**(총 3×feather) 나간다. 그래서 마스크 경계는 이웃 요소에서 `3×feather` 를 확보해 둔다(프사 오른쪽 ↔ 본문 첫 글자, 닉 아래 ↔ 본문 첫 줄).
- **프사 블러가 닉네임 블러보다 위 레이어.** 날짜는 안 가림(핸들 끝까지만).
- 예외 스샷은 manifest 항목에 `handleEnd/sigma/block/feather/avatarW/avatarH/avatarX/avatarY/nickX/nickY/nickH` 를 넣어 per-entry 로 덮어쓸 수 있다(prep-comments 가 blur-comments 로 통과시킴). **먼저 `node tools/blur-comments.mjs <이미지> --debug` 로 측정값을 보고 판단할 것.**
- **검수:** 결과를 그냥 보면 다 지워진 듯 보인다. **핸들 부분을 3배 확대해서 확인할 것** — `ffmpeg -i out.png -vf "crop=iw:60:0:0,scale=iw*3:ih*3:flags=neighbor" zoom.png`.

**타이밍 분배:** 영상 길이 ÷ 댓글 개수 = 균등 슬롯, **항상 1개 연속 노출**(슬롯 경계 0.3s 크로스페이드). `anchor` 있는 댓글은 그 시점 슬롯에 배치(충돌 시 가까운 빈 슬롯), 나머지는 남은 슬롯에 순서대로 — "특정부분에 합당하게 + 나머지는 균등".

**표시(레이아웃):** 영상 바로 밑 16px 틈, 가운데. 폭은 **내용 길이대로 가변**(가로 긴 댓글은 넓게, 짧은 댓글은 작게) — 모든 댓글 같은 배율 `COMMENT_SCALE`(GoodVibeSongs.tsx, 기본 1.0)로 글자 크기는 일정, `maxWidth 1020` 캡. 글자 더 키우려면 SCALE↑.

**⚠️ 타임라인 참조 댓글은 물어볼 것:** `1:06` 처럼 **특정 타임스탬프**를 가리키는 댓글은 그게 영상의 어느 가사/장면인지 Claude 가 알 수 없음 → **`AskUserQuestion` 으로 사용자에게 물어** `anchor` 초를 정할 것. 가사 내용을 직접 가리키는 댓글(예: 특정 가사 구절 반응)은 해당 caption `start` 로 직접 매칭 가능.

## 영상 식별 / 안전 영역

- 경로: `videos/<channel>/<number>/` (number 숫자, 3자리 권장). 결재본: `output/<channel>/<number>/<number>.mp4` (영상번호별 폴더, 캡션·댓글·자막 동거).
- 3-band 레이아웃이 플랫폼 오버레이(좋아요/공유)를 자연히 피함 — 자막은 영상 영역 안.

## 도구 (`tools/`)

| 도구 | 역할 |
| --- | --- |
| `sync-av.mjs` | 직캠 오디오 ↔ 깨끗한 음원 onset 교차상관 정렬 + 먹싱 (프레임워크 무관, 원본 그대로) |
| `prep-media.mjs` | 원본 → `media/<slug>.mp4` 임포트 (트랜스코드+키프레임+loudnorm+사이드카, 원본 그대로) |
| `new-video.mjs` | 영상 스캐폴드: props.json/meta.json + source.mp4 심볼링크 + public 하드링크 + durationInFrames(마지막 프레임 pts) + space_lab layout 자동 계산 |
| `transcribe.mjs` | whisper.cpp STT → transcript.json (`@remotion/install-whisper-cpp`) |
| `align-script.mjs` | LCS 정렬 → props.json 의 captions (경로 A) |
| `detect-gaps.mjs` | STT 무보컬(간주) 구간 검출 — transcribe 가 STT 직후 자동 호출(늘린 환각/깨진 토큰/침묵). 캡션 비울 구간 제안 (음악 자막 간주-연속 방지). 단독 CLI + `--srt` 검증 |
| `check-captions.mjs` | 오버플로 사전 감지 (상단멘트 + space_lab 경고박스). `--lang` 지원. **TopCaption 은 넘쳐도 자동 축소가 없고 위로 밀려 잘리므로 이게 유일한 안전망** |
| `validate-props.mjs` | 렌더 전 정합성 검증 (hyperframes lint/validate 대체). `--lang` 지원 |
| `derive-lang.mjs` | 🌏 `props.json` → `props.<lang>.json` 파생 + `--sync` 로 구조 필드만 재동기화 (번역문 보존). **번역은 안 함** |
| `render.mjs` | 🌏 결재본 렌더 — 언어별 순차 렌더 + composition id 변환 + 렌더 전 check-captions 자동 게이트 |
| `preview.mjs` | 채널 고정 포트로 `remotion studio` (props + 미디어 자동). `--lang` 지원 |
| `blur-comments.mjs` | 댓글 스샷 프사+닉네임 비식별화 (굿바이브 전용). 스샷 지오메트리 자동 측정(`--debug`) + 모자이크→가우시안. 예외는 플래그로 덮어쓰기 |
| `prep-comments.mjs` | `<번호>댓글/` → 블러(자동 지오메트리)+영상디렉토리 복사+타이밍 분배+props 기록 (굿바이브 전용) |
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
9. **언어 enum 은 `src/props.ts` 와 `tools/channels.mjs` 두 곳의 손수 동기화 미러** — 한쪽만 고치면 zod 는 통과하는데 `validate-props` 가 거부하거나 그 반대가 된다. 항상 양쪽 같이.
10. **Google Fonts 는 subset 을 빠뜨리면 조용히 깨진다** — Inter 에 `vietnamese` 가 없으면 베트남어 성조부호만 폴백 폰트로 새고, weight 를 안 올리면(태국어 500/700) 합성 굵기가 나온다. 새 언어를 추가할 땐 `src/fonts.ts` 의 subsets·weights 를 실제 사용값과 맞출 것.
