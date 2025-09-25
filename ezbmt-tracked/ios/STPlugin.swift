import Foundation
import AVFoundation
import VisionCamera

@objc(STPlugin)
public class STPlugin: FrameProcessorPlugin {

@objc
override public init(proxy: VisionCameraProxyHolder, options: [AnyHashable : Any]?) {
super.init(proxy: proxy, options: options)
}

// 注意：一定要覆寫「實例方法」，簽名要是 Frame / Any?（不是 IUO）
@objc
override public func callback(_ frame: Frame, withArguments arguments: [AnyHashable : Any]?) -> Any? {
let ts = frame.timestamp // VisionCamera 為毫秒
return ["x": 0.5, "y": 0.5, "ts": ts, "w": 100, "h": 100, "score": 999]
}

// 相容舊 selector（部分環境會呼叫 withArgs）
@objc(callback:withArgs:)
public func callback_legacy(_ frame: Frame, withArgs args: [AnyHashable : Any]?) -> Any? {
return callback(frame, withArguments: args)
}
}
