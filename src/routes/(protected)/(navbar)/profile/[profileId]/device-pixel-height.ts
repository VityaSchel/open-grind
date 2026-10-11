import type { Attachment } from "svelte/attachments";

const DEVICE_PIXEL_HEIGHT = "--device-pixel-height";
const FLOAT_NOISE_DEVICE_PX = 1 / 1024;

export const devicePixelHeight: Attachment<HTMLElement> = (element) => {
	const snap = () => {
		const ratio = window.devicePixelRatio;
		const { height } = element.getBoundingClientRect();
		const devicePixels = Math.floor(height * ratio + FLOAT_NOISE_DEVICE_PX);
		element.style.setProperty(
			DEVICE_PIXEL_HEIGHT,
			`${devicePixels / ratio}px`,
		);
	};
	let resolution: MediaQueryList | null = null;
	const followResolution = () => {
		resolution?.removeEventListener("change", followResolution);
		resolution = window.matchMedia(
			`(resolution: ${window.devicePixelRatio}dppx)`,
		);
		resolution.addEventListener("change", followResolution);
		snap();
	};
	const resize = new ResizeObserver(snap);
	resize.observe(element);
	followResolution();
	return () => {
		resize.disconnect();
		resolution?.removeEventListener("change", followResolution);
		element.style.removeProperty(DEVICE_PIXEL_HEIGHT);
	};
};
