import * as clipboard from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "svelte-sonner";

import { ApiError } from "$lib/api/api-error";
import { confirmCopyError } from "$lib/api/copy-error-confirm-state.svelte";
import { errorReport, type RedactionOptions } from "$lib/api/error-report";

export function getErrorText(
	error: unknown,
	options: RedactionOptions,
): string {
	return JSON.stringify(errorReport(error, options), null, 2);
}

export async function promptCopyError(error: unknown): Promise<void> {
	const copyOptions = await confirmCopyError(error);
	if ("abort" in copyOptions) return;
	await writeToClipboard(getErrorText(error, { redact: copyOptions.redact }));
}

async function writeToClipboard(text: string): Promise<void> {
	try {
		await clipboard.writeText(text);
		toast.success("Copied to clipboard");
	} catch (error) {
		console.error(error);
	}
}

function isSessionGone({ kind }: ApiError): boolean {
	return kind === "SessionCleared" || kind === "NotLoggedIn";
}

export function showErrorToast({
	label = "An error occurred",
	error,
	onRetry,
}: {
	label?: string;
	error: unknown;
	onRetry?: () => void;
}) {
	if (error instanceof ApiError && isSessionGone(error)) return;
	if (onRetry && error instanceof ApiError && error.retryable) {
		toast.error(label, {
			action: {
				label: "Retry",
				onClick: onRetry,
			},
			cancel: {
				label: "Copy details",
				onClick: () => void promptCopyError(error).catch(() => {}),
			},
		});
		return;
	}
	toast.error(label, {
		action: {
			label: "Copy details",
			onClick: () => void promptCopyError(error).catch(() => {}),
		},
	});
}
