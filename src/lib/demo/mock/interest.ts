import { HOUR, MINUTE, NOW } from "../config";
import { demoFavoriteOf } from "./favorites";
import { lastOnlineOf, onlineUntilOf, photosOf, profileSeed } from "./profiles";

const TAP_TYPES = [0, 1, 2] as const;
const tapSourceIds = [
	100001, 100006, 100009, 100013, 100250, 100777, 100042, 100123, 100333,
	100512, 100640, 100888, 100999, 101234,
];
const viewSourceIds = [
	100001, 100002, 100004, 100009, 100013, 100250, 100777, 100333, 100512,
	100640,
];
const secretAdmirerCount = 5;

export function demoReceivedTaps() {
	return tapSourceIds.map((id, i) => {
		const seed = profileSeed(id);
		const photos = photosOf(id);
		return {
			distance: seed.distanceM ?? null,
			profileImageMediaHash: photos[0] ?? null,
			isFavorite: demoFavoriteOf({ profileId: id, seed: seed.favorite }),
			profileId: id,
			displayName: seed.name,
			onlineUntil: onlineUntilOf(seed),
			timestamp: NOW - (i + 1) * 23 * MINUTE,
			tapType: TAP_TYPES[i % TAP_TYPES.length],
			lastOnline: lastOnlineOf(seed),
			isBoosting: false,
			isMutual: i % 4 === 0,
			rightNowType: "",
			isViewable: true,
		};
	});
}

export function demoViews() {
	const profiles = viewSourceIds.map((id, i) => {
		const seed = profileSeed(id);
		const photos = photosOf(id);
		return {
			profileImageMediaHash: photos[0] ?? null,
			distance: seed.distanceM ?? null,
			isFavorite: demoFavoriteOf({ profileId: id, seed: seed.favorite }),
			lastViewed: NOW - (i + 1) * 41 * MINUTE,
			isSecretAdmirer: false,
			viewedCount: { totalCount: 1 + (i % 4), maxDisplayCount: 99 },
			profileId: id,
			displayName: seed.name,
			onlineUntil: onlineUntilOf(seed),
		};
	});
	const previews = Array.from({ length: secretAdmirerCount }, (_, i) => ({
		profileImageMediaHash: null,
		distance: null,
		isFavorite: false,
		lastViewed: NOW - (i + 1) * 2 * HOUR,
		isSecretAdmirer: true,
		viewedCount: { totalCount: 1, maxDisplayCount: 99 },
	}));
	return { profiles, previews };
}
