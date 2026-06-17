#!/usr/bin/env node
/**
 * 유튜브 댓글 스크린샷의 프사(좌상단 원형) + 닉네임(@핸들)을 가우시안 블러로 가린다.
 * 굿바이브 하단 댓글 오버레이용. 날짜(2か月前 등)는 남기고 핸들 끝까지만 가린다.
 *
 * 표준 레시피 (사용자 확정 "sigma12 타이트"):
 *   - 흐림 sigma=12 (프리미어 흐림값 ≈ 20 매핑), 페더(가장자리 부드럽게) sigma=5
 *   - 프사 마스크: x0 y0 90x90        (좌상단 원형 아바타 + 여백)
 *   - 닉네임 마스크: x82 y6 (handleEnd-82)x42   (핸들 시작~끝. x82 로 아바타와 살짝 겹침)
 *   - 프사 블러가 닉네임 블러보다 위 레이어
 *   - handleEnd 는 @핸들 끝(날짜 직전) x좌표 — 스샷마다 달라 측정값으로 받는다.
 *
 * 사용법:
 *   node tools/blur-comments.mjs <image> --handle-end <x> [--out <path>]
 *        [--sigma 12] [--feather 5] [--avatar-w 90] [--avatar-h 90]
 *        [--nick-x 82] [--nick-y 6] [--nick-h 42]
 *   --out 생략 시 <image>.blur.png 로 저장.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const DEFAULTS = {
  sigma: 12,
  feather: 5,
  avatarW: 90,
  avatarH: 90,
  nickX: 82,
  nickY: 6,
  nickH: 42,
};

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// 댓글 스샷 1장 블러. (다른 도구에서 import 해서 재사용)
export function blurComment(src, out, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (o.handleEnd == null || !isFinite(o.handleEnd)) {
    throw new Error("blurComment: handleEnd (핸들 끝 x좌표) 필요");
  }
  const nw = Math.round(o.handleEnd - o.nickX);
  if (nw <= 0) throw new Error(`blurComment: handleEnd(${o.handleEnd}) <= nickX(${o.nickX})`);
  const fc = [
    `[0:v]split=4[base][fb][fn][fa]`,
    `[fb]gblur=sigma=${o.sigma}:steps=3[bl]`,
    `[bl]split[bl1][bl2]`,
    // 닉네임 마스크 (검정 채우고 흰 박스 → 페더 → gray)
    `[fn]drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill,drawbox=x=${o.nickX}:y=${o.nickY}:w=${nw}:h=${o.nickH}:color=white:t=fill,gblur=sigma=${o.feather},format=gray[mn]`,
    // 프사 마스크
    `[fa]drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill,drawbox=x=0:y=0:w=${o.avatarW}:h=${o.avatarH}:color=white:t=fill,gblur=sigma=${o.feather},format=gray[ma]`,
    // 닉네임 블러(아래) → 프사 블러(위)
    `[bl1][mn]alphamerge[nk]`,
    `[base][nk]overlay=0:0[t]`,
    `[bl2][ma]alphamerge[av]`,
    `[t][av]overlay=0:0`,
  ].join(";");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-filter_complex", fc, out], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  return out;
}

function parseArgs(argv) {
  const opts = { ...DEFAULTS, handleEnd: null, out: null };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const num = () => parseFloat(argv[++i]);
    if (a === "--handle-end") opts.handleEnd = num();
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--sigma") opts.sigma = num();
    else if (a === "--feather") opts.feather = num();
    else if (a === "--avatar-w") opts.avatarW = num();
    else if (a === "--avatar-h") opts.avatarH = num();
    else if (a === "--nick-x") opts.nickX = num();
    else if (a === "--nick-y") opts.nickY = num();
    else if (a === "--nick-h") opts.nickH = num();
    else if (a.startsWith("--")) die(`Unknown flag: ${a}`);
    else positional.push(a);
  }
  const [src] = positional;
  if (!src) die("Usage: node tools/blur-comments.mjs <image> --handle-end <x> [--out <path>]");
  if (opts.handleEnd == null) die("--handle-end <x> (핸들 끝 x좌표, 날짜 직전) 필요");
  if (!fs.existsSync(src)) die(`Not found: ${src}`);
  if (!opts.out) {
    const ext = path.extname(src);
    opts.out = src.slice(0, -ext.length || undefined) + ".blur.png";
  }
  return { src, ...opts };
}

// 직접 실행 시 CLI
if (path.resolve(process.argv[1] || "") === path.resolve(new URL(import.meta.url).pathname)) {
  const { src, out, ...opts } = parseArgs(process.argv.slice(2));
  blurComment(src, out, opts);
  console.log(`✓ ${out}  (sigma=${opts.sigma} feather=${opts.feather} handleEnd=${opts.handleEnd})`);
}
