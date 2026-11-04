import { registerAccountCache } from "#lib/api/account-caches.ts";
import { showErrorToast } from "#lib/api/error-toast.ts";
import { recordProfileView } from "#lib/api/interest/views.ts";
import { getPreferences } from "#lib/app-data/preferences.svelte.ts";
import { t } from "#lib/i18n/index.ts";

const visitedProfileIds = new Set<number>();

registerAccountCache({ reset: forgetProfileVisits });

export function forgetProfileVisits(): void {
	visitedProfileIds.clear();
}

export async function recordProfileVisit({
	profileId,
	ourProfileId,
}: {
	profileId: number;
	ourProfileId: number;
}): Promise<void> {
	if (visitedProfileIds.has(profileId)) return;
	visitedProfileIds.add(profileId);
	if (!Number.isFinite(profileId) || profileId === ourProfileId) return;
	try {
		const { revealProfileViews } = await getPreferences();
		if (!revealProfileViews) return;
		await recordProfileView({ profileId });
	} catch (error) {
		console.error(error);
		showErrorToast({
			label: t("profile.visit.errors.recordFailed"),
			error,
		});
	}
}
