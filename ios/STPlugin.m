#if __has_include(<VisionCamera/FrameProcessorPlugin.h>)
#import <VisionCamera/FrameProcessorPlugin.h>
#import <VisionCamera/Frame.h>
#elif __has_include(<VisionCamera/FrameProcessor/FrameProcessorPlugin.h>)
// 某些版本在子目錄 FrameProcessor 下
#import <VisionCamera/FrameProcessor/FrameProcessorPlugin.h>
#import <VisionCamera/FrameProcessor/Frame.h>
#elif __has_include(<react-native-vision-camera/FrameProcessorPlugin.h>)
#import <react-native-vision-camera/FrameProcessorPlugin.h>
#import <react-native-vision-camera/Frame.h>
#elif __has_include(<react-native-vision-camera/FrameProcessor/FrameProcessorPlugin.h>)
#import <react-native-vision-camera/FrameProcessor/FrameProcessorPlugin.h>
#import <react-native-vision-camera/FrameProcessor/Frame.h>
#else
// 走搜尋路徑（我們已把 node_modules/…/ios/FrameProcessor 加進 Header Search Paths）
#import "FrameProcessorPlugin.h"
#import "Frame.h"
#endif

#import "ezbmt-Swift.h"

// Swift 類與 JS 名稱都叫 STPlugin
VISION_EXPORT_SWIFT_FRAME_PROCESSOR(STPlugin, STPlugin)
