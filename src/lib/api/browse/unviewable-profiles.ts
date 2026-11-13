import { markBlockedProfilesUnviewable } from "#lib/api/browse/blocks.ts";
import { markHiddenProfilesUnviewable } from "#lib/api/browse/hides.ts";

export function markBlockedAndHiddenProfilesUnviewable(): void {
	void markBlockedProfilesUnviewable().catch((error) => console.error(error));
	void markHiddenProfilesUnviewable().catch((error) => console.error(error));
}
