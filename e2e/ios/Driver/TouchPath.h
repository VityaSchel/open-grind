#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface OGTouchPath : NSObject

+ (BOOL)synthesizePoints:(NSArray<NSValue *> *)points
	offsets:(NSArray<NSNumber *> *)offsets
	completion:(void (^)(BOOL synthesized, NSError *_Nullable failure))completion;

@end

NS_ASSUME_NONNULL_END
