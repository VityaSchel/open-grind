import type { RenderedGridProfile } from "./grid";

export function rendered({
	id,
	isFavorite = false,
}: {
	id: number;
	isFavorite?: boolean;
}): RenderedGridProfile {
	return {
		type: "rendered",
		id,
		displayName: `Profile ${id}`,
		age: null,
		distance: null,
		profilePhotosHashes: null,
		unread: null,
		onlineUntil: null,
		seen: null,
		isFavorite,
		isVisiting: false,
		hasChattedInLast24Hrs: false,
	};
}
