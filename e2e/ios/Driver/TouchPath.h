#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface OGTouchPath : NSObject

+ (BOOL)synthesizePoints:(NSArray<NSValue *> *)points
	offsets:(NSArray<NSNumber *> *)offsets
	completion:(void (^)(NSError *_Nullable failure))completion
	error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
