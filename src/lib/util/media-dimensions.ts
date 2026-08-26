export type MediaDimensions = { width: number; height: number };

export async function measureImage(url: string): Promise<MediaDimensions> {
	const img = document.createElement("img");
	img.src = url;
	try {
		await new Promise<void>((resolve, reject) => {
			if (img.complete) {
				if (img.naturalWidth > 0) resolve();
				else reject(new Error(`Failed to load image: ${url}`));
			}
			img.addEventListener("load", () => resolve(), { once: true });
			img.addEventListener(
				"error",
				({ error }) =>
					reject(
						new Error(`Failed to load image: ${url}`, {
							cause: error,
						}),
					),
				{ once: true },
			);
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
				({ error }) =>
					reject(
						new Error(`Failed to load video: ${url}`, {
							cause: error,
						}),
					),
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
