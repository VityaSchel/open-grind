import z from "zod";

const timestamp = z.coerce.number().int().nonnegative();

export const INBOX_LAST_VIEWED_PREFIX = "chat:inbox-last-viewed:";

function key(profileId: number): string {
	return `${INBOX_LAST_VIEWED_PREFIX}${profileId}`;
}

export function loadInboxLastViewed(profileId: number): number {
	if (typeof localStorage === "undefined") return 0;
	return timestamp.safeParse(localStorage.getItem(key(profileId))).data ?? 0;
}

export function saveInboxLastViewed({
	profileId,
	at,
}: {
	profileId: number;
	at: number;
}): void {
	if (typeof localStorage === "undefined") return;
	localStorage.setItem(key(profileId), String(at));
}
