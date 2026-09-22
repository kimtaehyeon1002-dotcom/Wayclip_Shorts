// 레포 좌표 — 대시보드는 이 레포의 파일을 GitHub API 로 읽고 커밋한다.
export const REPO = { owner: "kimtaehyeon1002-dotcom", name: "Wayclip_Shorts", branch: "main" } as const;
export const PATHS = {
  schedule: "publisher/schedule.json",
  formatsDir: "formats",
  guidesDir: "formats/guides",
  outputIndex: "output-index.json",
  followers: "web/src/data/followers.json",
  publishWorkflow: "publish-due.yml",
} as const;
export const KST = "Asia/Seoul";
