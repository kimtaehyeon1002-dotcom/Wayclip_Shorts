# web — Wayclip Shorts 대시보드 (GitHub Pages)

Vite + React 정적 SPA. **서버 없음** — 데이터는 이 레포의 파일(`publisher/schedule.json`, `formats/*.json`, `output-index.json`)을 GitHub API 로 읽고, 편집은 같은 API 로 **커밋**한다.

| 페이지 | 하는 일 |
| --- | --- |
| 대시보드 | 대기/오류/다음 게시, R2 미업로드 경고, publish-due 워크플로 실행 이력 + "지금 게시"/"점검만" 버튼 |
| 스케줄 | 예약 추가·수정·삭제 → `publisher/schedule.json` 커밋 (항목 id 기준 upsert — 퍼블리셔 커밋과 충돌 없음) |
| 포맷 | `formats/*.json` 카드 + IG 시크릿 연결 여부. **새 포맷** 위저드 → `formats/<slug>.json` + `guides/<slug>.md` 커밋 |
| 결재본 | `output-index.json` 목록, (R2 키 입력 시) presigned URL 로 바로 재생 |
| 팔로워 | 채널별 팔로워 차트 (`web/src/data/followers.json` 편집 → 커밋) |
| 설정 | PAT / R2 키 (localStorage 에만 저장) |

## 세팅
1. GitHub → Settings → Developer settings → **Fine-grained token**: Repository access = 이 레포만, Permissions: **Contents Read/Write**, **Actions Read/Write**, Metadata Read.
2. 대시보드 → 설정 → 토큰 붙여넣기 → "토큰 테스트".
3. (선택) 결재본 재생: R2 Account ID / Access Key / Secret / Bucket.

## 개발
```bash
npm run dev -w @wayclip/web        # http://localhost:5173/Wayclip_Shorts/
npm run build -w @wayclip/web      # web/dist → pages.yml 이 배포
```
