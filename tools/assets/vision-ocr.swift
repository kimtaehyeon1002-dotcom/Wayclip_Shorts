// macOS Vision 텍스트 인식 — 이미지 여러 장을 받아 JSON 배열로 출력.
// 사용: swift tools/assets/vision-ocr.swift <img1> <img2> …   (또는 미리 swiftc 로 빌드)
import Foundation
import Vision
import AppKit

func recognize(_ path: String) -> [String] {
    guard let img = NSImage(contentsOfFile: path),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return [] }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = false
    req.recognitionLanguages = ["en-US"]
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    try? handler.perform([req])
    guard let obs = req.results else { return [] }
    // 위에서 아래로 (Vision 은 y 가 아래에서 위)
    return obs.sorted { $0.boundingBox.maxY > $1.boundingBox.maxY }
              .compactMap { $0.topCandidates(1).first?.string }
}

var out: [[String: Any]] = []
for path in CommandLine.arguments.dropFirst() {
    out.append(["file": path, "lines": recognize(path)])
}
let data = try! JSONSerialization.data(withJSONObject: out, options: [])
FileHandle.standardOutput.write(data)
