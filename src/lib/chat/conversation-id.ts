export function conversationIdFor({
	profileId,
	ourProfileId,
}: {
	profileId: number;
	ourProfileId: number;
}): string {
	return [profileId, ourProfileId].toSorted((a, b) => a - b).join(":");
}
