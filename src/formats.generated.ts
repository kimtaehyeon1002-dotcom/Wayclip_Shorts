// 자동 생성 — 손대지 말 것. 원본: formats/*.json. 재생성: node tools/gen-formats.mjs
// (Remotion 번들러가 JSON 을 정적으로 import 하도록 목록을 코드로 고정한다.)
import f0 from "../formats/goodvibesongs.json";
import f1 from "../formats/goodmovies.json";
import f2 from "../formats/readyaction.json";
import f3 from "../formats/thishiphop.json";
import f4 from "../formats/space_lab.json";

export const FORMAT_JSON = [f0, f1, f2, f3, f4] as const;
export const FORMAT_SLUGS = ["goodvibesongs", "goodmovies", "readyaction", "thishiphop", "space_lab"] as const;
