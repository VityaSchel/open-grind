const BLOCKED_ID = 100801;
const BLOCKED_US_BACK_ID = 100802;

const blockedIds = new Set([
	BLOCKED_ID,
	BLOCKED_US_BACK_ID,
	...Array.from({ length: 10 }, (_, index) => 100805 + index),
]);

export function demoBlockedUsers(): {
	profileId: number;
	blockedTime: number;
}[] {
	return [...blockedIds].map((profileId) => ({ profileId, blockedTime: 0 }));
}

export function demoSetBlocked({
	profileId,
	blocked,
}: {
	profileId: number;
	blocked: boolean;
}): void {
	if (blocked) blockedIds.add(profileId);
	else blockedIds.delete(profileId);
}

export function demoProfileResolves(profileId: number): boolean {
	return profileId !== BLOCKED_US_BACK_ID;
}
