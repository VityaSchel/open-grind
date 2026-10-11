import { toast } from "svelte-sonner";

import { BlockDidNotStickError } from "$lib/api/browse/blocks";
import { showErrorToast } from "$lib/api/error-toast";
import { t } from "$lib/i18n";
import { openExternalLink } from "$lib/platform/link-opener";

const WHY_BLOCKING_FAILS_URL =
	"https://opengrind.org/guides/blocking-and-hiding-profiles#why-cant-i-block-some-profiles";

export function showBlockFailure(error: unknown): void {
	if (error instanceof BlockDidNotStickError) {
		toast.error(t("profile.viewability.errors.blockIgnored"), {
			action: {
				label: t("common.actions.learnMore"),
				onClick: () => openExternalLink(WHY_BLOCKING_FAILS_URL),
			},
		});
		return;
	}
	showErrorToast({
		label: t("profile.viewability.errors.blockFailed"),
		error,
	});
}
