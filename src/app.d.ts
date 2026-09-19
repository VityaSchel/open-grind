declare global {
	namespace App {
		interface PageState {
			profileOrigin?: "browse";
		}
	}

	interface Window {
		__reapplyInsets: () => unknown;
		__AndroidInsets?: {
			top(): number;
			bottom(): number;
			left(): number;
			right(): number;
			imeVisible?(): boolean;
		};
		__AndroidOnBackGesture?: () => boolean;
		__AndroidOnBackGestureStart?: () => boolean;
		__AndroidOnBackGestureCancel?: () => void;
		__AndroidBack?: { moveTaskToBack(): void; gestureProgress(): number };
		pswp?: unknown;
	}
}

export {};
