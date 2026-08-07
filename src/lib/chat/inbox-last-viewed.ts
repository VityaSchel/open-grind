import z from "zod";

const timestamp = z.coerce.number().int().nonnegative();

function key(profileId: number): string {
	return `chat:inbox-last-viewed:${profileId}`;
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
