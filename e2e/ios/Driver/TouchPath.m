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

static NSError *touchPathFailure(NSString *message) {
	return [NSError errorWithDomain:@"Driver"
		code:1
		userInfo:@{NSLocalizedDescriptionKey: message}];
}

@implementation OGTouchPath

+ (BOOL)synthesizePoints:(NSArray<NSValue *> *)points
	offsets:(NSArray<NSNumber *> *)offsets
	completion:(void (^)(NSError *_Nullable failure))completion
	error:(NSError **)error {
	Class pathClass = NSClassFromString(@"XCPointerEventPath");
	Class recordClass = NSClassFromString(@"XCSynthesizedEventRecord");
	id<OGEventSynthesizerOwner> device =
		(id<OGEventSynthesizerOwner>)XCUIDevice.sharedDevice;
	if (!pathClass || !recordClass ||
		![device respondsToSelector:@selector(eventSynthesizer)]) {
		if (error) *error = touchPathFailure(@"this XCTest has no event synthesizer");
		return NO;
	}
	if (points.count < 2 || points.count != offsets.count) {
		if (error) {
			*error = touchPathFailure(@"touchPath needs at least two points, each with an offset");
		}
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
	[device.eventSynthesizer synthesizeEvent:record
		completion:^(BOOL synthesized, NSError *_Nullable failure) {
			completion(synthesized
				? nil
				: (failure ?: touchPathFailure(@"touchPath was not synthesized")));
		}];
	return YES;
}

@end
