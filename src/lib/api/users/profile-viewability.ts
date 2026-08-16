import { registerAccountCache } from "$lib/api/account-caches";

export type ProfileViewabilityChange = { profileId: number; viewable: boolean };

export type ProfileViewabilityListener = (
	change: ProfileViewabilityChange,
) => void;

const unviewableProfileIds = new Set<number>();
const listeners = new Set<ProfileViewabilityListener>();

registerAccountCache({ reset: () => unviewableProfileIds.clear() });

function notify(change: ProfileViewabilityChange): void {
	for (const listener of [...listeners]) listener(change);
}

export function isProfileViewable(profileId: number): boolean {
	return !unviewableProfileIds.has(profileId);
}

export function markProfileUnviewable(profileId: number): void {
	if (!isProfileViewable(profileId)) return;
	unviewableProfileIds.add(profileId);
	notify({ profileId, viewable: false });
}

export function markProfileViewable(profileId: number): void {
	unviewableProfileIds.delete(profileId);
	notify({ profileId, viewable: true });
}

export function onProfileViewabilityChange(
	listener: ProfileViewabilityListener,
): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
