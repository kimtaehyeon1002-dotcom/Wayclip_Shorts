#!/bin/bash
# 109 굿무비 — 소스 편집 재현. 자세한 근거는 edit.md 참조.
# 입력: 레포 루트의 "109 굿무비 원본.mp4" / "109 굿무비 마지막 컷.mp4"
#       (「109 굿무비 소스.mp4」 는 2026-08-26 사용자 지시로 미사용 — 페이드아웃으로 끝냄)
# 출력: edited.mp4 (1080x960 / 30fps / 27.50s) → prep-media.mjs … the-last-10-years-2022 --overwrite
set -e
cd "$(dirname "$0")/../../.."          # 레포 루트
# 원본이 있는 디렉토리. 기본은 레포 루트(사용자가 여기에 올려줌).
# worktree 등 다른 곳에서 돌릴 땐  SRCDIR=/path/to/repo bash edit.sh
SRCDIR="${SRCDIR:-$PWD}"

ORIG="$SRCDIR/109 굿무비 원본.mp4"
LAST="$SRCDIR/109 굿무비 마지막 컷.mp4"
OUT="videos/goodmovies/109/edited.mp4"

CROP_TOP="crop=706:628:187:0"      # 박힌 자막(y 628~718) 위만. 706 = 628*1.125
CROP_STD="crop=810:720:135:0"      # 표준 센터. 810 = 720*1.125
CROP_LAST="crop=1006:894:457:92"   # 마지막컷 콘텐츠박스 1348x894@(286,92) 안에서 894*1.125
POST="scale=1080:960:flags=lanczos,setsar=1,fps=30,format=yuv420p"
AFMT="aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo"

# 26.600 부터 0.6s 페이드아웃 → 27.200 완전 검정 → 0.3s 유지하고 끝
ffmpeg -v error -y \
  -i "$ORIG" -i "$LAST" \
  -f lavfi -t 0.300 -i "color=c=black:s=1080x960:r=30" \
  -f lavfi -t 0.900 -i "anullsrc=channel_layout=stereo:sample_rate=48000" \
  -filter_complex "
[0:v]trim=0:3.333,setpts=PTS-STARTPTS,${CROP_TOP},${POST}[v1];
[0:v]trim=3.333:24.533,setpts=PTS-STARTPTS,${CROP_STD},${POST}[v2];
[1:v]trim=0:2.667,setpts=PTS-STARTPTS,${CROP_LAST},${POST},fade=t=out:st=2.067:d=0.6:color=black[v3];
[2:v]${POST}[v4];
[0:a]atrim=0:26.600,asetpts=PTS-STARTPTS,${AFMT}[a1];
[3:a]${AFMT}[a2];
[v1][v2][v3][v4]concat=n=4:v=1:a=0[v];
[a1][a2]concat=n=2:v=0:a=1[a]
" -map "[v]" -map "[a]" \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -ar 48000 \
  "$OUT"

ffprobe -v error -show_entries format=duration \
  -show_entries stream=codec_type,width,height,r_frame_rate -of default=noprint_wrappers=1 "$OUT"
