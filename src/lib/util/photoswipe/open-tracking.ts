import type { PhotoSwipeModule, PhotoSwipeModuleOption } from "photoswipe";
import type PhotoSwipeLightbox from "photoswipe/lightbox";

type Listener = () => void;

const busyLightboxes = new Set<PhotoSwipeLightbox>();
const openingListeners = new Set<Listener>();
const idleListeners = new Set<Listener>();

export function isPhotoSwipeBusy(): boolean {
	return busyLightboxes.size > 0;
}

export function onPhotoSwipeOpening(listener: Listener): () => void {
	openingListeners.add(listener);
	return () => {
		openingListeners.delete(listener);
	};
}

export function onPhotoSwipeIdle(listener: Listener): () => void {
	idleListeners.add(listener);
	return () => {
		idleListeners.delete(listener);
	};
}

function notify(listeners: Set<Listener>): void {
	for (const listener of [...listeners]) listener();
}

function release(lightbox: PhotoSwipeLightbox): void {
	if (busyLightboxes.delete(lightbox) && busyLightboxes.size === 0)
		notify(idleListeners);
}

function specialKeyUsed(event: MouseEvent): boolean {
	return (
		event.button === 1 ||
		event.ctrlKey ||
		event.metaKey ||
		event.altKey ||
		event.shiftKey
	);
}

function isCoreLoader(
	option: PhotoSwipeModuleOption | undefined,
): option is () => Promise<PhotoSwipeModule> {
	return typeof option === "function" && !option.prototype?.goTo;
}

export function applyPhotoSwipeOpenTracking(
	lightbox: PhotoSwipeLightbox,
): () => void {
	const { gallery, pswpModule } = lightbox.options;
	if (!(gallery instanceof HTMLElement))
		throw new TypeError("PhotoSwipe open tracking needs a gallery element");

	const trackOpening = (event: MouseEvent) => {
		if (specialKeyUsed(event) || window.pswp !== undefined) return;
		const index = lightbox.applyFilters(
			"clickedIndex",
			lightbox.getClickedIndex(event),
			event,
			lightbox,
		);
		if (index < 0) return;
		busyLightboxes.add(lightbox);
		notify(openingListeners);
	};
	gallery.addEventListener("click", trackOpening, true);

	if (isCoreLoader(pswpModule))
		lightbox.options.pswpModule = () =>
			pswpModule().catch((error: unknown) => {
				release(lightbox);
				throw error;
			});

	lightbox.on("destroy", () => {
		release(lightbox);
	});

	return () => {
		gallery.removeEventListener("click", trackOpening, true);
		release(lightbox);
	};
}
