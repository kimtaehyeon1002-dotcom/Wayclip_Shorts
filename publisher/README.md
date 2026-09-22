# publisher — 인스타 릴스 자동 게시 (GitHub Actions)

`output/<채널>[-언어]/<번호>/<번호>.mp4` + `<번호>캡션.txt` 를 **스케줄(`schedule.json`)대로 인스타 릴스로 게시**하고 첫 댓글(고정댓글)을 단다.
예전 `shorts-publisher`(맥 cron)의 후신 — 이제 **GitHub Actions cron(10분마다)** 이 돌리므로 맥이 꺼져 있어도 게시된다.

```
맥(CLI)                                   GitHub Actions (publish-due.yml, */10)
render.mjs → 캡션 txt → upload-output.mjs   → schedule.json 읽기 → R2 의 결재본 presign
        ↓ R2 (output/<ch>/<n>/…)            → Graph API 릴스 게시 + 첫 댓글
        ↓ output-index.json (레포 커밋)       → schedule.json 상태 커밋(commit-schedule.mjs)
```

## 운영

| 할 일 | 방법 |
| --- | --- |
| 예약 추가/수정 | 웹 대시보드(Pages) Schedule 탭, 또는 `publisher/schedule.json` 직접 편집 후 커밋 |
| 지금 게시 | Actions → publish-due → Run workflow (`id` 지정 가능, `dry_run` 체크로 점검만) |
| 현황 | `node publisher/publish-reel.mjs --list` / 대시보드 |
| 로컬 점검 | `node publisher/publish-reel.mjs --due --dry-run` (R2 없이도 로컬 output/ 로 점검) |

## 시크릿 (GitHub → Settings → Secrets and variables → Actions)

| 이름 | 값 |
| --- | --- |
| `IG_<SLUG대문자>_<LANG대문자>` (예 `IG_GOODMOVIES_JA`, `IG_SPACE_LAB_JA`) | `{"igUserId":"…","igAccessToken":"…"}` — 채널×언어별. 발급: `node publisher/setup-ig-token.mjs <앱ID> <시크릿> <단기토큰>` |
| `R2_ACCOUNT_ID` `R2_ACCESS_KEY_ID` `R2_SECRET_ACCESS_KEY` `R2_BUCKET` | Cloudflare R2 (프라이빗 버킷, presigned URL 로만 노출) |
| `GMAIL_USER` `GMAIL_APP_PASSWORD` `NOTIFY_TO` | (선택) 게시 결과 메일 |

IG 토큰은 페이지 토큰이라 사실상 무기한이지만 앱/비번 변경 시 만료된다. 만료되면 해당 항목이 `error` 로 남고 메일이 온다 → 재발급 후 시크릿 교체.

## 로컬 실행 (선택)

`publisher/.env`(`.env.example` 참고) + `publisher/channels.json`(`channels.example.json`) 을 채우면 맥에서도 그대로 돈다.
로컬 `output/` 에 결재본이 있으면 R2 정규 키로 올린 뒤 게시하므로 upload-output 을 따로 안 돌려도 된다.

## 규칙
- **보류 원칙:** 자격증명·캡션·영상 중 하나라도 없으면 게시하지 않고 `pending` 유지. 준비되면 다음 틱에 자동 게시.
- **중복 방지:** 워크플로 `concurrency: publish` + 게시 직전 최근 25개 게시물 캡션 앞 30자 대조.
- **`schedule.json` 커밋:** 이번 런이 바꾼 항목의 status/mediaId/commentId/publishedAt/error 만 원격 최신본 위에 덮어씀 — 웹에서 동시에 편집한 항목 보존.
- 인스타 제한: 24시간 50개.
