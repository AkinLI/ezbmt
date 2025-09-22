#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(RNSpeedCamViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(isActive, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(onSample, RCTDirectEventBlock)
@end