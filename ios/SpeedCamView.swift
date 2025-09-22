import Foundation
import AVFoundation
import React

@objc(SpeedCamView)
class SpeedCamView: UIView, AVCaptureVideoDataOutputSampleBufferDelegate {

@objc var isActive: NSNumber = 1 {
didSet { isActive.boolValue ? start() : stop() }
}
@objc var onSample: RCTDirectEventBlock?

private let session = AVCaptureSession()
private var previewLayer: AVCaptureVideoPreviewLayer?
private let queue = DispatchQueue(label: "speedcam.capture")

// 差分快取
private var prevData: Data?
private var prevW: Int = 0
private var prevH: Int = 0
private var prevStride: Int = 0

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
session.sessionPreset = .high

guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
      let input = try? AVCaptureDeviceInput(device: device),
      session.canAddInput(input) else { return }
session.addInput(input)

let output = AVCaptureVideoDataOutput()
output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange]
output.alwaysDiscardsLateVideoFrames = true
output.setSampleBufferDelegate(self, queue: queue)
guard session.canAddOutput(output) else { return }
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

// 取幀並做 Y 平面差分
func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {

guard let pb = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
let tsMs = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer)) * 1000.0 // ms

let plane = 0 // Y
CVPixelBufferLockBaseAddress(pb, .readOnly)
defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
guard let base = CVPixelBufferGetBaseAddressOfPlane(pb, plane) else { return }

let w = CVPixelBufferGetWidthOfPlane(pb, plane)
let h = CVPixelBufferGetHeightOfPlane(pb, plane)
let stride = CVPixelBufferGetBytesPerRowOfPlane(pb, plane)

let curr = Data(bytes: base, count: stride * h)

var bx = 0, by = 0, best = 0
if let prev = prevData, prevW == w, prevH == h, prevStride == stride {
  prev.withUnsafeBytes { pr in
    curr.withUnsafeBytes { cr in
      let pPrev = pr.bindMemory(to: UInt8.self).baseAddress!
      let pCurr = cr.bindMemory(to: UInt8.self).baseAddress!
      let step = 8
      var y = 0
      while y < h {
        let rp = pPrev.advanced(by: y * stride)
        let rc = pCurr.advanced(by: y * stride)
        var x = 0
        while x < w {
          let d = abs(Int(rc[x]) - Int(rp[x]))
          if d > best { best = d; bx = x; by = y }
          x += step
        }
        y += step
      }
    }
  }
}

prevData = curr
prevW = w; prevH = h; prevStride = stride

if best == 0 { return }

// 轉 normalized
let nx = Double(bx) / Double(w)
let ny = Double(by) / Double(h)

onSample?([
  "x": nx, "y": ny,
  "ts": tsMs,
  "w": w, "h": h,
  "score": best
])
}
}