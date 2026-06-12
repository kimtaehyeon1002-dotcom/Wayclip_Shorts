import { Config } from "@remotion/cli/config";

// 세로형 쇼츠 공통 렌더 설정. 해상도/길이/fps 는 각 <Composition> 에서 정의.
Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
Config.setAudioCodec("aac");
// SNS 호환 픽셀 포맷. (Remotion 출력은 video/audio start_time 이 이미 0 → 검정 프레임 정규화 불필요.)
Config.setPixelFormat("yuv420p");
// 컴포지션 캔버스를 그대로 인코딩 (1080x1920).
Config.setOverwriteOutput(true);
// GL 렌더러는 기본값 사용 (WebGL/Three 미사용). "angle" 은 headless/CI(GPU 없음)에서 실패하고
// 메모리 누수가 있어 명시하지 않는다 — Remotion 이 환경에 맞는 기본(로컬 null / CI swangle)을 고름.
