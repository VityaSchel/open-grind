#import "TouchPath.h"

#import <UIKit/UIKit.h>
#import <XCTest/XCTest.h>

@protocol OGPointerEventPath <NSObject>
- (instancetype)initForTouchAtPoint:(CGPoint)point offset:(double)offset;
- (void)moveToPoint:(CGPoint)point atOffset:(double)offset;
- (void)liftUpAtOffset:(double)offset;
@end

@protocol OGSynthesizedEventRecord <NSObject>
- (instancetype)initWithName:(NSString *)name
	interfaceOrientation:(UIInterfaceOrientation)orientation;
- (void)addPointerEventPath:(id<OGPointerEventPath>)path;
@end

@protocol OGEventSynthesizer <NSObject>
- (void)synthesizeEvent:(id<OGSynthesizedEventRecord>)event
	completion:(void (^)(BOOL synthesized, NSError *_Nullable failure))completion;
@end

@protocol OGEventSynthesizerOwner <NSObject>
- (id<OGEventSynthesizer>)eventSynthesizer;
@end

@implementation OGTouchPath

+ (BOOL)synthesizePoints:(NSArray<NSValue *> *)points
	offsets:(NSArray<NSNumber *> *)offsets
	completion:(void (^)(BOOL synthesized, NSError *_Nullable failure))completion {
	Class pathClass = NSClassFromString(@"XCPointerEventPath");
	Class recordClass = NSClassFromString(@"XCSynthesizedEventRecord");
	id<OGEventSynthesizerOwner> device =
		(id<OGEventSynthesizerOwner>)XCUIDevice.sharedDevice;
	if (!pathClass || !recordClass ||
		![device respondsToSelector:@selector(eventSynthesizer)]) {
		return NO;
	}
	id<OGPointerEventPath> path = [(id<OGPointerEventPath>)[pathClass alloc]
		initForTouchAtPoint:points.firstObject.CGPointValue
		offset:offsets.firstObject.doubleValue];
	for (NSUInteger index = 1; index < points.count; index++) {
		[path moveToPoint:points[index].CGPointValue
			atOffset:offsets[index].doubleValue];
	}
	[path liftUpAtOffset:offsets.lastObject.doubleValue];
	id<OGSynthesizedEventRecord> record =
		[(id<OGSynthesizedEventRecord>)[recordClass alloc]
			initWithName:@"touchPath"
			interfaceOrientation:UIInterfaceOrientationPortrait];
	[record addPointerEventPath:path];
	[device.eventSynthesizer synthesizeEvent:record completion:completion];
	return YES;
}

@end
