#!/usr/bin/env bash
# 로컬 비밀(publisher/channels.json + publisher/.env)을 GitHub Actions Secrets 로 올린다. 한 번만.
#   bash tools/setup-secrets.sh            # 레포: kimtaehyeon1002-dotcom/Wayclip_Shorts
# 전제: gh auth login 완료 (repo 스코프). 값은 터미널에 출력되지 않는다.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="${REPO:-kimtaehyeon1002-dotcom/Wayclip_Shorts}"

# 1) 인스타 자격증명 — channels.json 의 키가 slug 면 IG_<SLUG>_JA, "slug-lang" 이면 IG_<SLUG>_<LANG>
node -e '
const fs=require("fs"); const ch=JSON.parse(fs.readFileSync("publisher/channels.json","utf8"));
for (const [k,c] of Object.entries(ch)) {
  if (!c || !c.igUserId || !c.igAccessToken) continue;
  const m=/^(.+?)-([a-z]{2})$/.exec(k); const slug=m?m[1]:k; const lang=m?m[2]:"ja";
  const name="IG_"+slug.toUpperCase()+"_"+lang.toUpperCase();
  fs.writeFileSync(".secret-"+name, JSON.stringify({igUserId:c.igUserId, igAccessToken:c.igAccessToken}));
  console.log(name);
}' | while read -r name; do
  gh secret set "$name" -R "$REPO" < ".secret-$name" && echo "✓ $name"
  rm -f ".secret-$name"
done

# 2) R2 + Gmail — .env 의 값 그대로
set -a; . publisher/.env; set +a
for k in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET GMAIL_USER GMAIL_APP_PASSWORD NOTIFY_TO; do
  v="${!k:-}"; [ -z "$v" ] && continue
  printf '%s' "$v" | gh secret set "$k" -R "$REPO" && echo "✓ $k"
done
echo; gh secret list -R "$REPO"
