import type PhotoSwipeLightbox from "photoswipe/lightbox";
import type { ComponentProps } from "svelte";

import { openExternalLink } from "$lib/platform/link-opener";
import { isLinuxPlatform } from "$lib/platform/os";
import { canDecodeH264 } from "$lib/platform/video-codecs";
import type VideoPlayer from "$lib/components/shared/VideoPlayer.svelte";

const BROKEN_MEDIA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="64" height="64" fill="var(--color-neutral-500)" style="display:block" aria-hidden="true"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16h64a8,8,0,0,0,7.59-5.47l14.83-44.48L163,151.43a8.07,8.07,0,0,0,4.46-4.46l14.62-36.55,44.48-14.83A8,8,0,0,0,232,88V56A16,16,0,0,0,216,40ZM117,152.57a8,8,0,0,0-4.62,4.9L98.23,200H40V160.69l46.34-46.35a8,8,0,0,1,11.32,0l32.84,32.84Zm115-30.84V200a16,16,0,0,1-16,16H137.73a8,8,0,0,1-7.59-10.53l7.94-23.8a8,8,0,0,1,4.61-4.9l35.77-14.31,14.31-35.77a8,8,0,0,1,4.9-4.61l23.8-7.94A8,8,0,0,1,232,121.73Z"/></svg>`;

export type Failure = Parameters<
	NonNullable<ComponentProps<typeof VideoPlayer>["onfail"]>
>[0];

export const failures = new WeakMap<object, Failure>();

const CODECS_GUIDE = "https://opengrind.org/guides/codecs";

function undecodableNotice(): HTMLParagraphElement {
	const notice = document.createElement("p");
	notice.className = "mt-4 max-w-80 text-center text-sm text-neutral-400";
	if (!isLinuxPlatform() || canDecodeH264()) {
		notice.textContent = "This video cannot be played on this system.";
		return notice;
	}
	notice.textContent =
		"Playing this video needs an H.264 decoder, which is not installed on this system. ";
	const guide = document.createElement("a");
	guide.href = CODECS_GUIDE;
	guide.className = "underline";
	guide.textContent = "How to install video codecs";
	guide.onclick = (event) => {
		event.preventDefault();
		openExternalLink(CODECS_GUIDE);
	};
	notice.append(guide);
	return notice;
}

export function applyPhotoSwipeErrorUi(lightbox: PhotoSwipeLightbox): void {
	lightbox.addFilter("contentErrorElement", (element, content) => {
		const failure = failures.get(content);
		if (failure !== undefined) element.dataset.failure = failure.detail;
		element.innerHTML = BROKEN_MEDIA_SVG;
		if (failure?.undecodable === true) {
			element.classList.add("flex", "flex-col", "items-center");
			element.append(undecodableNotice());
			return element;
		}
		element.setAttribute("role", "img");
		element.setAttribute("aria-label", "Media failed to load");
		return element;
	});
}
