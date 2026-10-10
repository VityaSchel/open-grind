import {
	describeMediaFailure,
	mediaFailure,
} from "$lib/platform/media-failure";

export type MediaDimensions = { width: number; height: number };

async function imageLoadFailure(url: string): Promise<Error> {
	const failure = describeMediaFailure(await mediaFailure(url));
	return new Error(`Failed to load image (${failure})`);
}

export async function measureImage(url: string): Promise<MediaDimensions> {
	const img = document.createElement("img");
	img.src = url;
	try {
		await new Promise<void>((resolve, reject) => {
			const fail = () => void imageLoadFailure(url).then(reject);
			if (img.complete) {
				if (img.naturalWidth > 0) resolve();
				else fail();
			}
			img.addEventListener("load", () => resolve(), { once: true });
			img.addEventListener("error", fail, { once: true });
		});
		return { width: img.naturalWidth, height: img.naturalHeight };
	} finally {
		img.remove();
	}
}
