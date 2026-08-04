import type { ApiResponseMessage } from "$lib/model/messaging/messages";

export type CachedConversation = {
	messages: ApiResponseMessage[];
	profile: {
		distance: number | null;
		mediaHash: string | null;
		name: string | null;
		onlineUntil: number | null;
		profileId: number;
		showDistance: boolean;
	};
	pageKey: string | null;
	lastReadTimestamp: number | null;
};
