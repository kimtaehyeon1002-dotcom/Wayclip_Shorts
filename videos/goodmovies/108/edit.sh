#!/bin/bash
# 108 굿무비 — 영상은 소스를 레퍼런스 컷 구성대로 자르고, 오디오는 레퍼런스(원본) 트랙을 통째로 입힌다.
# (사용자 요청: "지금 편집본에 전부 원본 음성으로 입혀")
set -e
cd "$(dirname "$0")"

CROP="crop=776:690:260:0,scale=1080:960:flags=lanczos,setsar=1"

ffmpeg -v error -y -i src.mp4 -i ref.mp4 -filter_complex "
[0:v]trim=0.367:4.700,setpts=PTS-STARTPTS,${CROP}[v0];
[0:v]trim=14.500:16.667,setpts=PTS-STARTPTS,${CROP}[v1];
[0:v]trim=22.500:29.933,setpts=PTS-STARTPTS,${CROP}[v2];
[0:v]trim=32.200:34.334,setpts=PTS-STARTPTS,${CROP}[v3];
[0:v]trim=36.067:41.250,setpts=PTS-STARTPTS,${CROP}[v4];
[v0][v1][v2][v3][v4]concat=n=5:v=1[v];
[1:a]atrim=0:21.30,asetpts=PTS-STARTPTS,aresample=48000[a]
" -map "[v]" -map "[a]" \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p \
  -c:a pcm_s16le \
  edited2.mov

echo "--- edited2.mov ---"
ffprobe -v error -show_entries format=duration -show_entries stream=codec_type,width,height,start_time,duration -of default=noprint_wrappers=1 edited2.mov
echo "--- loudness ---"
ffmpeg -hide_banner -i edited2.mov -af loudnorm=print_format=summary -f null - 2>&1 | grep -E "^Input (Integrated|True Peak|LRA)"
