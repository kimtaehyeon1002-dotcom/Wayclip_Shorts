#!/usr/bin/env node
// 인스타 토큰/ID 자동 발급 도우미.
// 사용법:
//   node setup-ig-token.mjs <APP_ID> <APP_SECRET> <단기토큰>
// 필요 스코프(단기토큰 만들 때): instagram_basic, instagram_content_publish,
//   instagram_manage_comments, pages_show_list, pages_read_engagement, business_management
// 하는 일:
//   1) 단기 토큰 → 장기 user 토큰 교환
//   2) 페이지 찾기: me/accounts → (비면) me/businesses 의 owned/client_pages 까지 탐색
//   3) 각 페이지의 instagram_business_account(IG User ID) + 무기한 PAGE 토큰 추출
//   4) .env 에 넣을 IG_USER_ID / IG_ACCESS_TOKEN 출력
const GRAPH = 'https://graph.facebook.com/v21.0';
const [appId, appSecret, shortToken] = process.argv.slice(2);

if (!appId || !appSecret || !shortToken) {
  console.log('사용법: node setup-ig-token.mjs <APP_ID> <APP_SECRET> <단기토큰>');
  process.exit(1);
}

async function get(path, params) {
  const qs = new URLSearchParams(params).toString();
  const json = await fetch(`${GRAPH}/${path}?${qs}`).then((r) => r.json());
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json;
}

// 페이지에서 IG 계정 + 무기한 페이지 토큰 뽑기
async function pageToIg(pageId, userToken) {
  const info = await get(pageId, {
    fields: 'name,access_token,instagram_business_account',
    access_token: userToken,
  });
  if (!info.instagram_business_account) return null;
  return {
    page: info.name,
    igUserId: info.instagram_business_account.id,
    pageToken: info.access_token, // 장기 user 토큰에서 파생되면 무기한
  };
}

try {
  // 1) 장기 토큰 교환
  const ex = await get('oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  });
  const longToken = ex.access_token;
  console.log('✅ 장기 user 토큰 발급됨.');

  // 2) 페이지 수집 — me/accounts 우선, 비면 비즈니스 포트폴리오까지
  const pageIds = new Set();
  const direct = await get('me/accounts', { fields: 'id', access_token: longToken });
  (direct.data || []).forEach((p) => pageIds.add(p.id));

  if (pageIds.size === 0) {
    console.log('ℹ️  me/accounts 가 비어 비즈니스 포트폴리오를 탐색합니다…');
    const biz = await get('me/businesses', { fields: 'id,name', access_token: longToken });
    for (const b of biz.data || []) {
      for (const edge of ['owned_pages', 'client_pages']) {
        const pages = await get(`${b.id}/${edge}`, { fields: 'id', access_token: longToken });
        (pages.data || []).forEach((p) => pageIds.add(p.id));
      }
    }
  }

  // 3) 각 페이지 → IG
  const found = [];
  for (const pid of pageIds) {
    const ig = await pageToIg(pid, longToken);
    if (ig) found.push(ig);
  }

  // 4) 출력
  console.log('\n──────────── .env 에 붙여넣으세요 ────────────');
  if (found.length === 0) {
    console.log('# ⚠ 연결된 인스타 비즈니스 계정을 못 찾음.');
    console.log('#   - 단기토큰에 business_management 스코프를 넣었는지');
    console.log('#   - 인스타가 프로페셔널 계정 + 페이지(설정→연결된 계정)에 연결됐는지 확인.');
    console.log('IG_USER_ID=');
    console.log('IG_ACCESS_TOKEN=');
  } else {
    if (found.length > 1) {
      console.log('# 여러 IG 계정 발견 — 올릴 채널을 고르세요:');
      found.forEach((f, i) => console.log(`#   [${i}] ${f.page} → IG ${f.igUserId}`));
      console.log('# (아래는 [0]. 다른 걸 쓰려면 해당 줄 값으로 교체)');
    }
    console.log(`IG_USER_ID=${found[0].igUserId}`);
    console.log(`IG_ACCESS_TOKEN=${found[0].pageToken}   # PAGE 토큰(무기한)`);
    if (found.length > 1) {
      console.log('\n# 전체 목록:');
      found.forEach((f) => console.log(`#   ${f.page}: IG_USER_ID=${f.igUserId}`));
    }
  }
  console.log('──────────────────────────────────────────────');
} catch (e) {
  console.error('❌ 실패:', e.message);
  process.exit(1);
}
