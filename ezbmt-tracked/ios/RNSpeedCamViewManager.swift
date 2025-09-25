import Foundation
import React

@objc(RNSpeedCamViewManager)
class RNSpeedCamViewManager: RCTViewManager {
override static func requiresMainQueueSetup() -> Bool { true }
override func view() -> UIView! { SpeedCamView() }
}