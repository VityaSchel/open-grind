const H264_BASELINE = 'video/mp4; codecs="avc1.42E01E"';

export function canDecodeH264(): boolean {
	return document.createElement("video").canPlayType(H264_BASELINE) !== "";
}
