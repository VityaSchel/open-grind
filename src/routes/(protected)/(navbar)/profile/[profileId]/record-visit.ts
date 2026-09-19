import { showErrorToast } from "$lib/api/error-toast";
import { recordProfileView } from "$lib/api/interest/views";
import { getPreferences } from "$lib/app-data/preferences.svelte";

export async function recordProfileVisit({
	profileId,
	ourProfileId,
}: {
	profileId: number;
	ourProfileId: number;
}): Promise<void> {
	if (!Number.isFinite(profileId) || profileId === ourProfileId) return;
	try {
		const { revealProfileViews } = await getPreferences();
		if (!revealProfileViews) return;
		await recordProfileView({ profileId });
	} catch (error) {
		console.error(error);
		showErrorToast({
			label: "Failed to record profile view preference or action",
			error,
		});
	}
}
