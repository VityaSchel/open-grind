import { toast } from "svelte-sonner";

import { ApiError } from "$lib/api/api-error";
import { promptCopyError } from "$lib/api/error-copy";
import { t } from "$lib/i18n";

function isSessionGone({ kind }: ApiError): boolean {
	return kind === "SessionCleared" || kind === "NotSignedIn";
}

export function showErrorToast({
	label = t("feedback.errorToast.defaultLabel"),
	error,
	onRetry,
}: {
	label?: string;
	error: unknown;
	onRetry?: () => void;
}) {
	if (error instanceof ApiError && isSessionGone(error)) return;
	const copyDetails = {
		label: t("feedback.errorToast.copyDetails"),
		onClick: () => void promptCopyError(error).catch(() => {}),
	};
	if (onRetry) {
		toast.error(label, {
			action: { label: t("common.actions.retry"), onClick: onRetry },
			cancel: copyDetails,
		});
		return;
	}
	toast.error(label, { action: copyDetails });
}
