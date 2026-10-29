import type { KeyboardMotion } from "$lib/platform/keyboard-follow";
import type { NativeInsets } from "$lib/platform/native-insets";

declare global {
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
		pswp?: unknown;
	}
}

export {};
