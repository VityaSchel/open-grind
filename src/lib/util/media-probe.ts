import {
	acquireMediaLoadSlot,
	releaseWhenSettled,
} from "$lib/util/media-load-slots";

const PROBE_TIMEOUT_MS = 30 * 1000;

export function probeMedia({
	src,
	signal,
}: {
	src: string;
	signal: AbortSignal;
}): Promise<(() => void) | null> {
	return new Promise((resolve) => {
		let settled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let image: HTMLImageElement | undefined;
		const settle = () => {
			settled = true;
			clearTimeout(timer);
			signal.removeEventListener("abort", abort);
		};
		const finish = (loaded: boolean) => {
			if (settled) return;
			settle();
			if (loaded) return resolve(release);
			release();
			resolve(null);
		};
		const abort = () => {
			if (settled) return;
			settle();
			if (image !== undefined && !image.complete)
				releaseWhenSettled({ image, release });
			else release();
			resolve(null);
		};
		const release = acquireMediaLoadSlot(() => {
			if (settled) return;
			const loading = new Image();
			image = loading;
			loading.onload = () => finish(loading.naturalWidth > 0);
			loading.onerror = () => finish(false);
			loading.src = src;
			timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
		});
		if (signal.aborted) abort();
		else signal.addEventListener("abort", abort, { once: true });
	});
}
