import type { GiphyTile } from "$lib/api/messaging/gifs";

export function gifTile(
	id: string,
	{ alt = `GIF ${id}` }: { alt?: string } = {},
): GiphyTile {
	return {
		id,
		tileUrl: `https://media.giphy.com/media/${id}/200w.webp`,
		stillTileUrl: `https://media.giphy.com/media/${id}/200_s.gif`,
		alt,
		body: {
			id,
			urlPath: `https://media.giphy.com/media/${id}/200.gif`,
			previewPath: `https://media.giphy.com/media/${id}/200.gif`,
			stillPath: `https://media.giphy.com/media/${id}/200_s.gif`,
			width: 200,
			height: 150,
			imageHash: `giphy/${id}`,
		},
	};
}
