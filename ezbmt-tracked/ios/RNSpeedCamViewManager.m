#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(RNSpeedCamViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(isActive, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(onSample, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(yMin, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(chromaMax, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(blockSize, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(roiPad, NSNumber)
@end