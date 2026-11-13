import { withDeadline } from "#lib/util/deadline.ts";
import type { MediaDimensions } from "#lib/util/media-dimensions.ts";

const CACHED_SIZES = 64;
const FULL_SIZE_WAIT_MS = 1500;

const loads = new Map<string, Promise<MediaDimensions | null>>();
const known = new Map<string, MediaDimensions>();

function forgetOldest(): void {
	const oldest = loads.keys().next().value;
	if (oldest === undefined) return;
	loads.delete(oldest);
	known.delete(oldest);
}

export function preloadFullImage(src: string): Promise<MediaDimensions | null> {
	const pending = loads.get(src);
	if (pending !== undefined) return pending;
	const image = new Image();
	image.decoding = "async";
	image.src = src;
	const load: Promise<MediaDimensions | null> = image.decode().then(
		() => {
			const size = {
				width: image.naturalWidth,
				height: image.naturalHeight,
			};
			if (loads.get(src) === load) known.set(src, size);
			return size;
		},
		() => {
			if (loads.get(src) === load) loads.delete(src);
			return null;
		},
	);
	loads.set(src, load);
	if (loads.size > CACHED_SIZES) forgetOldest();
	return load;
}

export function knownFullImageSize(src: string): MediaDimensions | null {
	return known.get(src) ?? null;
}

export function fullImageSizeInTime(
	src: string,
): Promise<MediaDimensions | null> {
	return withDeadline({
		work: () => preloadFullImage(src),
		ms: FULL_SIZE_WAIT_MS,
	}).catch(() => null);
}
