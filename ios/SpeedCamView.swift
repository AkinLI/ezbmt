import Foundation
import AVFoundation
import React

@objc(SpeedCamView)
class SpeedCamView: UIView, AVCaptureVideoDataOutputSampleBufferDelegate {

// ====== RN 可調屬性 ======
@objc var isActive: NSNumber = 1 { didSet { isActive.boolValue ? start() : stop() } }
@objc var yMin: NSNumber = 140      // 亮度門檻（白色應偏亮）
@objc var chromaMax: NSNumber = 18  // 彩度偏移門檻（白色 ≈ U/V 靠近 128）
@objc var blockSize: NSNumber = 8   // 區塊邊長
@objc var roiPad: NSNumber = 64     // ROI 半徑
@objc var onSample: RCTDirectEventBlock?

// 權重與平滑（可視需要調整；不暴露到 JS 也行）
private let wMotion: Double = 1.0
private let wLuma:   Double = 0.5
private let wChroma: Double = 1.0
private let posAlpha: Double = 0.25  // 位置 EMA
private let maxMiss: Int = 8         // 連續弱訊號幀 → 回全畫面

// 相機
private let session = AVCaptureSession()
private var previewLayer: AVCaptureVideoPreviewLayer?
private let queue = DispatchQueue(label: "speedcam.capture")

// 上幀快取（Y 平面）
private var prevPtr: UnsafeMutablePointer<UInt8>?
private var prevCap: Int = 0
private var prevW = 0, prevH = 0, prevStride = 0

// ROI 狀態
private var useROI = false
private var roiX = 0, roiY = 0, roiW = 0, roiH = 0
private var miss = 0

// 位置平滑
private var emaCx: Double = 0
private var emaCy: Double = 0
private var hasEma = false

deinit { prevPtr?.deallocate() }

override init(frame: CGRect) {
super.init(frame: frame)
backgroundColor = .black
setupSession()
}
required init?(coder: NSCoder) { fatalError() }

override func layoutSubviews() {
super.layoutSubviews()
previewLayer?.frame = bounds
}

private func setupSession() {
session.beginConfiguration()
session.sessionPreset = .vga640x480

guard
  let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
  let input = try? AVCaptureDeviceInput(device: device),
  session.canAddInput(input)
else { session.commitConfiguration(); return }

session.addInput(input)

do {
  try device.lockForConfiguration()
  device.activeVideoMinFrameDuration = CMTime(value: 1, timescale: 30)
  device.activeVideoMaxFrameDuration = CMTime(value: 1, timescale: 30)
  device.unlockForConfiguration()
} catch {}

let output = AVCaptureVideoDataOutput()
output.videoSettings = [
  kCVPixelBufferPixelFormatTypeKey as String:
    kCVPixelFormatType_420YpCbCr8BiPlanarFullRange // NV12
]
output.alwaysDiscardsLateVideoFrames = true
output.setSampleBufferDelegate(self, queue: queue)
guard session.canAddOutput(output) else { session.commitConfiguration(); return }
session.addOutput(output)

let layer = AVCaptureVideoPreviewLayer(session: session)
layer.videoGravity = .resizeAspectFill
layer.frame = bounds
self.layer.addSublayer(layer)
self.previewLayer = layer

session.commitConfiguration()
if isActive.boolValue { session.startRunning() }
}

private func start() { if !session.isRunning { session.startRunning() } }
private func stop()  { if  session.isRunning { session.stopRunning()  } }

private func ensurePrev(cap: Int) {
if cap > prevCap {
prevPtr?.deallocate()
prevPtr = UnsafeMutablePointer<UInt8>.allocate(capacity: cap)
prevCap = cap
}
}

// 主處理：Block 差分 + 顏色過濾 + ROI
private func process(pb: CVPixelBuffer, tsMs: Double) {
CVPixelBufferLockBaseAddress(pb, .readOnly)
defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }

guard let yBaseRaw = CVPixelBufferGetBaseAddressOfPlane(pb, 0) else { return }
let yBase = yBaseRaw.assumingMemoryBound(to: UInt8.self)
guard let uvBaseRaw = CVPixelBufferGetBaseAddressOfPlane(pb, 1) else { return }
let uvBase = uvBaseRaw.assumingMemoryBound(to: UInt8.self)

let w = CVPixelBufferGetWidthOfPlane(pb, 0)
let h = CVPixelBufferGetHeightOfPlane(pb, 0)
let yStride = CVPixelBufferGetBytesPerRowOfPlane(pb, 0)
let uvStride = CVPixelBufferGetBytesPerRowOfPlane(pb, 1)
let cap = yStride * h

ensurePrev(cap: cap)

// 首幀：建立 prev
if prevPtr == nil || prevW != w || prevH != h || prevStride != yStride {
  memcpy(prevPtr!, yBase, cap)
  prevW = w; prevH = h; prevStride = yStride
  useROI = false; miss = 0; hasEma = false
  return
}

let B = max(4, Int(truncating: blockSize))       // block 邊長
let yMinV = max(0, min(255, Int(truncating: yMin)))
let cMaxV = max(0, min(255, Int(truncating: chromaMax)))
let roiPadPx = max(B, Int(truncating: roiPad))

// ROI 邊界
var sx = 0, sy = 0, ex = w - B, ey = h - B
if useROI {
  sx = max(0, roiX)
  sy = max(0, roiY)
  ex = min(w - B, roiX + roiW - B)
  ey = min(h - B, roiY + roiH - B)
}

var best = 0.0
var bx = sx, by = sy

var y = sy
while y <= ey {
  var x = sx
  while x <= ex {
    // 1) Motion: Sum |Ycurr - Yprev|
    var mSum = 0
    var lumaSum = 0
    var yy = 0
    while yy < B && (y + yy) < h {
      let pPrev = prevPtr!.advanced(by: (y + yy) * yStride + x)
      let pCurr = yBase.advanced(by: (y + yy) * yStride + x)
      var xx = 0
      while xx < B && (x + xx) < w {
        mSum += abs(Int(pCurr[xx]) - Int(pPrev[xx]))
        lumaSum += Int(pCurr[xx])
        xx += 1
      }
      yy += 1
    }
    let lAvg = lumaSum / (B * B)

    // 2) Chroma: NV12（UV 交錯，對應 2x2 的 block）
    // 用 2x2 採樣估計彩度偏移（越接近 128 越白）
    var cSum = 0
    var cCnt = 0
    var yy2 = 0
    while yy2 < B && (y + yy2) < h {
      let uvRow = (y + yy2) >> 1
      var xx2 = 0
      while xx2 < B && (x + xx2) < w {
        let uvCol = (x + xx2) >> 1
        let idx = uvRow * uvStride + uvCol * 2
        let cb = Int(uvBase[idx])
        let cr = Int(uvBase[idx + 1])
        cSum += abs(cb - 128) + abs(cr - 128)
        cCnt += 1
        xx2 += 2
      }
      yy2 += 2
    }
    let cMean = cCnt > 0 ? (cSum / cCnt) : 999

    // 3) 門檻：亮度足夠且彩度偏移小（白、亮）
    if lAvg >= yMinV && cMean <= cMaxV {
      // 4) 綜合分數：運動＋亮度＋白度
      let whiteGain = max(0.0, Double(cMaxV - cMean)) // 越白越高
      let s = Double(mSum) * wMotion + Double(lAvg) * wLuma + whiteGain * wChroma
      if s > best {
        best = s; bx = x; by = y
      }
    }
    x += B
  }
  y += B
}

// 更新 prev
memcpy(prevPtr!, yBase, cap)
prevW = w; prevH = h; prevStride = yStride

if best <= 0 {
  miss += 1
  if miss >= maxMiss { useROI = false }
  return
}
miss = 0

// ROI 更新（以最佳區塊中心為核心）
let cxPix = bx + B / 2
let cyPix = by + B / 2
let pad = roiPadPx
roiX = max(0, cxPix - pad)
roiY = max(0, cyPix - pad)
roiW = min(w - roiX, pad * 2)
roiH = min(h - roiY, pad * 2)
useROI = true

// 位置平滑（EMA）
let cx = Double(cxPix) / Double(w)
let cy = Double(cyPix) / Double(h)
if !hasEma { emaCx = cx; emaCy = cy; hasEma = true }
else {
  emaCx = posAlpha * cx + (1.0 - posAlpha) * emaCx
  emaCy = posAlpha * cy + (1.0 - posAlpha) * emaCy
}

// 回 JS（主執行緒）
if let onSample = self.onSample {
  DispatchQueue.main.async {
    onSample([
      "x": self.emaCx, "y": self.emaCy,
      "ts": tsMs,
      "w": w, "h": h,
      "score": best
    ])
  }
}
}

// AVCapture Delegate
func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
guard let pb = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
let tsMs = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer)) * 1000.0
process(pb: pb, tsMs: tsMs)
}
}