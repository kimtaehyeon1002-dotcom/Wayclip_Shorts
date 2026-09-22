# Wayclip_Shorts

세로형 쇼츠 양산(Remotion) + 인스타 릴스 자동 게시(GitHub Actions) + 대시보드(GitHub Pages) — 한 레포.

```
맥 CLI (Claude Code)                 GitHub Actions                     GitHub Pages
────────────────────────────         ──────────────────────────         ─────────────────────────
new-video → STT → 자막/번역           publish-due.yml (10분마다)          web/ 대시보드 (서버 없음)
→ 프리뷰 승인 → render.mjs            R2 결재본 → 인스타 릴스 게시        스케줄 편집 · 새 포맷 위저드
→ 캡션 txt → upload-output.mjs ──R2──▶ + 첫 댓글 → schedule.json 커밋  ◀──▶ 결재본 조회 · 팔로워 차트
```

| 구역 | 문서 |
| --- | --- |
| 편집·렌더 (맥) — 채널 규칙, 워크플로, 도구 전부 | [CLAUDE.md](./CLAUDE.md) |
| 게시 (Actions) — 시크릿, 운영, 규칙 | [publisher/README.md](./publisher/README.md) |
| 대시보드 (Pages) — PAT 설정, 페이지 | [web/README.md](./web/README.md) |
| 포맷(채널) 추가 | CLAUDE.md "새 포맷 추가" · `formats/*.json` · `packages/shared/format-schema.mjs` |

## 빠른 시작 (맥)

```bash
npm install
# 비밀 2개 인계받아 넣기 (gitignore): publisher/.env (R2 키), publisher/channels.json (IG 토큰)
node tools/new-video.mjs goodmovies 120 --media <slug> …     # 이하 CLAUDE.md 양산 워크플로
```

## 한 번만 하는 세팅 (레포 관리자)

1. `gh auth refresh -h github.com -s workflow` → `.github/workflows/*.yml` 커밋·푸시 (토큰에 workflow 스코프 필요).
2. `bash tools/setup-secrets.sh` → GitHub Secrets (`IG_<SLUG>_<LANG>`, `R2_*`, `GMAIL_*`).
3. `node tools/upload-output.mjs --all` → 기존 결재본을 R2 에 백필.
4. GitHub → Settings → Pages → Source: **GitHub Actions**. 대시보드 URL: `https://kimtaehyeon1002-dotcom.github.io/Wayclip_Shorts/`
5. 대시보드 설정 페이지에 fine-grained PAT(이 레포만: Contents RW, Actions RW) 입력.
6. 맥 crontab 의 옛 `run-due.sh` 줄 삭제 (이중 게시 방지).

---

# (보존) 맥 세팅 가이드 — 비전공자용


## 0. 먼저 알아둘 3가지 (중요)

1. **API 키·비밀번호·`.env` 파일 같은 건 하나도 필요 없습니다.** 이 프로젝트는 유료 API를 쓰지 않아요.
   번역·자막 작성 같은 "머리 쓰는 일"은 전부 **Claude Code(대화)** 가 대신 합니다. 그래서 Claude Code만 로그인돼 있으면 됩니다.
2. **레포(코드)에는 영상 파일이 들어있지 않습니다.** 원본 영상·완성본은 용량 때문에 일부러 빠져 있어요. 본인 영상 파일을 직접 넣어야 합니다.
3. **가장 정확한 결과물은 Mac에서 나옵니다.** 폰트가 맥 시스템 폰트라서요. 윈도우에서도 돌아가지만 글꼴이 100% 똑같지는 않습니다(비슷한 대체 폰트로 나옴).

---

## 1. 설치해야 하는 프로그램 (딱 3개)

아래 3개만 깔면 됩니다. 하나씩 순서대로 하세요. (코드는 2번에서 ZIP으로 받으니 Git은 없어도 됩니다.)

| 프로그램 | 하는 일 | 없으면 |
| --- | --- | --- |
| **Node.js** | 이 프로젝트를 실행하는 엔진 | 아무것도 안 됨 |
| **FFmpeg** | 영상을 변환·처리 (거의 모든 도구가 씀) | 영상 준비 단계에서 에러 |
| **Claude Code** | 번역·자막·캡션을 실제로 작성하는 두뇌 | 도구는 켜지지만 작업이 안 굴러감 |

> Chrome(크롬)은 따로 안 깔아도 됩니다. 처음 영상을 뽑을 때 프로그램이 알아서 내려받아요.

### 🍎 Mac 설치

터미널(응용프로그램 → 유틸리티 → 터미널)을 열고 아래를 한 줄씩 붙여넣으세요.

```bash
# (1) Homebrew — 맥용 설치 도우미. 이미 있으면 건너뜀
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# (2) Node.js + FFmpeg 한 번에
brew install node ffmpeg

# (3) 자막 기능(STT) 빌드에 필요한 애플 개발도구
xcode-select --install
```

Claude Code는 아래 한 줄로:

```bash
npm install -g @anthropic-ai/claude-code
```

### 🪟 Windows 설치

**PowerShell**(시작 → "PowerShell" 검색 → 실행)을 열고:

```powershell
# Node.js + FFmpeg 한 번에 (winget은 윈도우10/11 기본 탑재)
winget install OpenJS.NodeJS.LTS
winget install Gyan.FFmpeg

# 자막 빌드에 필요한 도구 (자막 기능 쓸 때만)
winget install Kitware.CMake
```

설치 후 **PowerShell 창을 껐다 다시 켜야** 명령어가 인식됩니다. 그다음:

```powershell
npm install -g @anthropic-ai/claude-code
```

> 윈도우에서 자막(STT) 기능이 빌드 에러가 나면 "Visual Studio Build Tools"가 필요할 수 있어요.
> 자막을 안 쓰고 번역 자막만 손으로 채운다면 이 단계는 건너뛰어도 됩니다.

### 설치 확인

터미널/PowerShell에서 아래를 쳐서 버전 숫자가 나오면 성공:

```bash
node -v      # 예: v20.x 이상
ffmpeg -version
claude --version
```

---

## 2. 코드 내려받기 & 준비

### (1) 코드 받기 — ZIP으로 다운로드 (터미널 안 씀)

1. 브라우저로 저장소 열기: **https://github.com/ganimjeong/remotion-shorts**
2. 초록색 **`< > Code`** 버튼 → **`Download ZIP`** 클릭.
3. 받은 ZIP을 더블클릭해 압축을 풀고, 나온 **`remotion-shorts` 폴더**를 원하는 위치(예: 사용자 홈 폴더)에 둡니다.
   > 폴더 이름이 `remotion-shorts-main` 으로 나오면 `remotion-shorts` 로 바꿔주세요.

### (2) 부품(라이브러리) 설치 — 이때만 터미널

압축 푼 폴더 안에서 터미널을 열고(맥: 폴더에서 우클릭 → "폴더에서 새로운 터미널 열기" / 윈도우: 폴더 주소창에 `cmd` 입력 후 Enter):

```bash
npm install
```

몇 분 걸립니다. 끝나면 코드 준비 완료. (`.env`나 키 설정 같은 건 없습니다.)

---

## 3. Claude Code 로그인

프로젝트 폴더 안에서:

```bash
claude
```

처음 실행하면 로그인 안내가 나옵니다. 안내대로 로그인하면 됩니다.
이제 대화창에 **한국어로 그냥 시키면** 됩니다. 예:

> "굿무비 080번 영상 자막 작업해줘"

Claude가 `CLAUDE.md`에 적힌 규칙대로 알아서 스캐폴드·번역·자막·렌더까지 진행합니다.

---

## 4. 첫 영상 만들어 보기 (흐름만)

세세한 명령은 Claude가 대신 쳐주지만, 큰 그림은 이렇습니다:

1. **원본 영상 준비** — 만들 영상 파일(mp4)을 프로젝트 폴더 안에 둡니다.
2. **채널·번호 정하기** — 예: 굿무비 080번.
3. **Claude에게 시키기** — "굿무비 080번 만들어줘, 원본은 ○○.mp4" 처럼.
4. Claude가 자막을 만들고 **미리보기(preview)** 를 띄워줍니다 → 브라우저에서 확인.
5. 마음에 들면 "렌더해줘" → 완성본이 `output/굿무비/080/080.mp4` 로 나옵니다.

> ⚠️ **미리보기 주소는 꼭 채널 경로까지 붙여서 열어야 합니다.** (예: `http://localhost:3004/goodmovies`)
> 그냥 `http://localhost:3004` 로 열면 엉뚱한 채널이 뜹니다.

---

## 5. 자주 막히는 곳 (문제 해결)

| 증상 | 원인 / 해결 |
| --- | --- |
| `command not found` (node/git/ffmpeg) | 설치가 안 됐거나, 터미널을 껐다 켜지 않음 → 창을 새로 열기 |
| `ffmpeg: not found` 인데 설치는 함 | 창 재시작. 윈도우는 `winget` 설치 후 반드시 재시작 |
| 자막(STT) 만들 때 빌드 에러 | Mac: `xcode-select --install` / Windows: Build Tools 필요 |
| 완성본 글꼴이 좀 달라 보임 | 정상입니다. 맥이 아니면 대체 폰트로 나옵니다. **최종본은 Mac에서 렌더**하세요 |
| 미리보기가 이상한 채널로 뜸 | 주소 끝에 채널 경로를 안 붙였을 때. `/goodmovies` 처럼 붙이기 |
| 영상 미리보기가 까맣게 나옴 | 영상 파일(source)이 제자리에 없을 때 → Claude에게 "다시 스캐폴드해줘" |

---

## 6. 폴더 구조 한눈에

```
remotion-shorts/
├── README.md          ← 지금 이 문서
├── CLAUDE.md          ← 실제 작업 규칙 (Claude가 따르는 매뉴얼)
├── src/               ← 채널별 디자인 코드 (건드릴 일 거의 없음)
├── tools/             ← 자동화 도구 모음 (Claude가 대신 실행)
├── media/             ← 공유 원본 영상 (직접 넣음, 레포엔 없음)
├── videos/<채널>/<번호>/  ← 영상별 작업 폴더
└── output/<채널>/<번호>/  ← 완성본이 나오는 곳
```

---

## 7. 다음 단계 — 자동 업로드 (별도 도구)

여기서 만든 완성본(`output/…/091.mp4`)을 **인스타그램 릴스로 자동 게시**하는 건 별도 프로젝트 **`shorts-publisher`** 가 합니다.
그 도구는 이 폴더(`remotion-shorts`)를 **바로 옆에 두고** 완성본을 찾아 올립니다. 세팅법은 `shorts-publisher`의 README를 참고하세요.

```
어떤폴더/
├── remotion-shorts/     ← 지금 이 프로젝트 (영상 제작)
└── shorts-publisher/    ← 업로드 도구 (나란히 두기)
```

---

## 요약

1. **Node.js · FFmpeg · Claude Code** 3개 설치
2. GitHub에서 **ZIP 다운로드** → 압축 풀기 → 그 폴더에서 `npm install`
3. `claude` 로그인
4. 한국어로 시키면 끝. 키·비밀번호 필요 없음.
5. **가장 정확한 완성본은 Mac에서.**
