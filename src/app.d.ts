import type { KeyboardMotion } from "#lib/platform/keyboard-follow.ts";
import type { NativeInsets } from "#lib/platform/native-insets.ts";

declare global {
	const __DEMO__: boolean;

	namespace App {
		interface PageState {
			profileOrigin?: "browse";
		}
	}

	interface Window {
		__reapplyInsets: (insets?: NativeInsets) => unknown;
		__AndroidInsets?: {
			top(): number;
			bottom(): number;
			left(): number;
			right(): number;
			imeVisible?(): boolean;
		};
		__iosInsets?: NativeInsets;
		__iosKeyboardMotion?: (motion: KeyboardMotion) => void;
		__AndroidOnBackGesture?: () => boolean;
		__AndroidOnBackGestureStart?: () => boolean;
		__AndroidOnBackGestureCancel?: () => void;
		__AndroidBack?: { moveTaskToBack(): void; gestureProgress(): number };
		__iosBack?: {
			start(point: { x: number; y: number }): boolean;
			progress(progress: number): void;
			finish(release: { commit: boolean; velocity: number }): void;
			prepare(): void;
		};
		pswp?: unknown;
	}
}

export {};
