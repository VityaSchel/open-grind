const SVG_MEDIA_TYPE = "image/svg+xml";

export function svgDataUrl(svg: string): string {
	return `data:${SVG_MEDIA_TYPE},${encodeURIComponent(svg)}`;
}
