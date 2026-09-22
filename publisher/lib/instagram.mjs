// 모든 함수는 creds = { userId, accessToken } 를 첫 인자로 받음 (채널별 계정 지원).
const GRAPH = 'https://graph.facebook.com/v21.0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gpost(creds, path, params) {
  const body = new URLSearchParams({ ...params, access_token: creds.accessToken });
  const res = await fetch(`${GRAPH}/${path}`, { method: 'POST', body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(`IG POST ${path} 실패: ${JSON.stringify(json.error || json)}`);
  }
  return json;
}

async function gget(creds, path, fields) {
  const url = `${GRAPH}/${path}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(creds.accessToken)}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(`IG GET ${path} 실패: ${JSON.stringify(json.error || json)}`);
  }
  return json;
}

// 1) REELS 미디어 컨테이너 생성 → container id 반환
//   trial: true | "MANUAL" | "SS_PERFORMANCE"  → 체험판 릴스(비팔로워 우선 노출).
//          공개 계정 + 팔로워 1,000명 이상에서만 동작.
//   shareToFeed: 릴스를 프로필 그리드/피드에도 노출할지 (boolean)
export async function createReelContainer(creds, { videoUrl, caption, trial, shareToFeed }) {
  const params = {
    media_type: 'REELS',
    video_url: videoUrl,
    caption: caption || '',
  };
  if (typeof shareToFeed === 'boolean') params.share_to_feed = String(shareToFeed);
  if (trial) {
    const graduation = trial === true ? 'MANUAL' : trial; // MANUAL | SS_PERFORMANCE
    params.trial_params = JSON.stringify({ graduation_strategy: graduation });
  }
  const json = await gpost(creds, `${creds.userId}/media`, params);
  return json.id;
}

// 2) 컨테이너 처리 완료까지 폴링 (Reels 는 인코딩에 수십 초~수 분)
export async function waitForContainer(
  creds,
  containerId,
  { timeoutMs = 5 * 60 * 1000, intervalMs = 6000, onTick } = {}
) {
  const start = Date.now();
  for (;;) {
    const json = await gget(creds, containerId, 'status_code,status');
    if (json.status_code === 'FINISHED') return;
    if (json.status_code === 'ERROR') {
      throw new Error(`컨테이너 처리 ERROR: ${json.status || ''}`);
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`컨테이너 처리 타임아웃 (마지막 상태: ${json.status_code})`);
    }
    if (onTick) onTick(json.status_code);
    await sleep(intervalMs);
  }
}

// 3) 컨테이너 게시 → media id 반환
export async function publishContainer(creds, containerId) {
  const json = await gpost(creds, `${creds.userId}/media_publish`, {
    creation_id: containerId,
  });
  return json.id;
}

// 게시된 미디어에 댓글 작성 (첫 댓글용). 권한: instagram_manage_comments
export async function postComment(creds, mediaId, message) {
  const json = await gpost(creds, `${mediaId}/comments`, { message });
  return json.id;
}

// 최근 미디어 캡션 앞부분과 대조 — 이미 올라간 영상인지(중복) 확인.
// 직전 게시가 네트워크 오류로 "실패"처럼 보였지만 실제론 서버에 올라간 경우를 잡아 재게시 방지.
export async function isAlreadyPosted(creds, captionFirstLine, limit = 25) {
  const key = (captionFirstLine || '').slice(0, 30);
  if (!key) return false;
  const url = `${GRAPH}/${creds.userId}/media?fields=caption&limit=${limit}&access_token=${encodeURIComponent(creds.accessToken)}`;
  try {
    const res = await fetch(url);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) return false; // 조회 실패 시 보수적으로 게시 진행
    return (json.data || []).some((m) => (m.caption || '').slice(0, 30) === key);
  } catch {
    return false;
  }
}
