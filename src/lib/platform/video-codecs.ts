import { toast } from "svelte-sonner";

import { isLinuxPlatform } from "./os";

const H264_BASELINE = 'video/mp4; codecs="avc1.42E01E"';
const MISSING_CODECS_TOAST_ID = "video-codecs-missing";

export const UNDECODABLE_VIDEO = "This video cannot be played on this system.";

export const UNDECODABLE_VIDEO_ON_LINUX =
	"Video needs GStreamer codecs that are not installed. Install gstreamer1.0-plugins-good and gstreamer1.0-libav, or your distribution's equivalents, then restart Open Grind.";

let warned = false;

export function canDecodeH264(): boolean {
	return document.createElement("video").canPlayType(H264_BASELINE) !== "";
}

export function warnAboutMissingVideoCodecs(): void {
	if (warned || !isLinuxPlatform() || canDecodeH264()) return;
	warned = true;
	toast.error(UNDECODABLE_VIDEO_ON_LINUX, { id: MISSING_CODECS_TOAST_ID });
}
