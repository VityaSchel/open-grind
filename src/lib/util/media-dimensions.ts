import {
	describeMediaFailure,
	mediaFailure,
} from "$lib/platform/media-failure";

export type MediaDimensions = { width: number; height: number };

async function loadFailure({
	what,
	url,
	mediaErrorCode,
}: {
	what: "image" | "video";
	url: string;
	mediaErrorCode?: number;
}): Promise<Error> {
	const failure = describeMediaFailure(await mediaFailure(url));
	const code =
		mediaErrorCode === undefined ? "" : `, media error ${mediaErrorCode}`;
	return new Error(`Failed to load ${what} (${failure}${code})`);
}

export async function measureImage(url: string): Promise<MediaDimensions> {
	const img = document.createElement("img");
	img.src = url;
	try {
		await new Promise<void>((resolve, reject) => {
			const fail = () =>
				void loadFailure({ what: "image", url }).then(reject);
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

export async function measureVideo(url: string): Promise<MediaDimensions> {
	const video = document.createElement("video");
	video.src = url;
	video.load();
	try {
		await new Promise<void>((resolve, reject) => {
			if (video.readyState >= HTMLMediaElement.HAVE_METADATA) resolve();
			video.addEventListener("loadedmetadata", () => resolve(), {
				once: true,
			});
			video.addEventListener(
				"error",
				() =>
					void loadFailure({
						what: "video",
						url,
						mediaErrorCode: video.error?.code,
					}).then(reject),
				{ once: true },
			);
		});
		return { width: video.videoWidth, height: video.videoHeight };
	} finally {
		video.removeAttribute("src");
		video.load();
		video.remove();
	}
}
