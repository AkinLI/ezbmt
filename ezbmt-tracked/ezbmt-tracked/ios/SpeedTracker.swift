import Foundation
import AVFoundation
import VisionCamera

@objc(SpeedTracker)
public class SpeedTracker: NSObject, FrameProcessorPlugin {
static var prevWidth: Int = 0
static var prevHeight: Int = 0
static var prevStride: Int = 0
static var prevData: Data? = nil
static var prevTs: Double = 0

public static func callback(_ frame: Frame!, withArgs args: [Any]!) -> Any! {
guard let pb = frame.buffer else { return nil }
let ts = frame.timestamp // seconds

// 只取 Y plane
let planeIndex = 0
CVPixelBufferLockBaseAddress(pb, .readOnly)
defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }

guard let base = CVPixelBufferGetBaseAddressOfPlane(pb, planeIndex) else { return nil }
let width = CVPixelBufferGetWidthOfPlane(pb, planeIndex)
let height = CVPixelBufferGetHeightOfPlane(pb, planeIndex)
let stride = CVPixelBufferGetBytesPerRowOfPlane(pb, planeIndex)

// 建立當幀的 luma Data（注意 stride）
let currData = Data(bytes: base, count: stride * height)

var bestX = 0
var bestY = 0
var bestDiff = 0

if let prev = SpeedTracker.prevData,
   SpeedTracker.prevWidth == width,
   SpeedTracker.prevHeight == height,
   SpeedTracker.prevStride == stride {

  prev.withUnsafeBytes { (prevPtrRaw: UnsafeRawBufferPointer) in
    currData.withUnsafeBytes { (currPtrRaw: UnsafeRawBufferPointer) in
      guard let prevPtr = prevPtrRaw.baseAddress?.assumingMemoryBound(to: UInt8.self),
            let currPtr = currPtrRaw.baseAddress?.assumingMemoryBound(to: UInt8.self) else { return }

      let step = 8 // 採樣步距，越小越精準但越吃效能
      var y = 0
      while y < height {
        let prevRow = prevPtr.advanced(by: y * stride)
        let currRow = currPtr.advanced(by: y * stride)
        var x = 0
        while x < width {
          let d = abs(Int(currRow[x]) - Int(prevRow[x]))
          if d > bestDiff {
            bestDiff = d
            bestX = x
            bestY = y
          }
          x += step
        }
        y += step
      }
    }
  }
}

// 更新前一幀快取
SpeedTracker.prevData = currData
SpeedTracker.prevWidth = width
SpeedTracker.prevHeight = height
SpeedTracker.prevStride = stride
SpeedTracker.prevTs = ts

if bestDiff == 0 {
  return nil
}
let nx = Double(bestX) / Double(width)
let ny = Double(bestY) / Double(height)

return [
  "x": nx,
  "y": ny,
  "ts": ts,
  "w": width,
  "h": height,
  "score": bestDiff
]
}
}

