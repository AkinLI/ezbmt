import Foundation
import VisionCamera

@objc(SpeedTracker)
public class SpeedTracker: FrameProcessorPlugin {

@objc
public static func callback(_ frame: Frame!, withArguments arguments: [Any]!) -> Any! {
// 固定回傳一筆樣本，用來驗證 JS 是否能收得到
let ts = frame?.timestamp ?? 0
return [
"x": 0.5,
"y": 0.5,
"ts": ts,
"w": 100,
"h": 100,
"score": 999
]
}
}
