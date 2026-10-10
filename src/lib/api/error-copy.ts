import * as clipboard from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "svelte-sonner";

import { confirmCopyError } from "$lib/api/copy-error-confirm-state.svelte";
import { errorReport, type RedactionOptions } from "$lib/api/error-report";
import { t } from "$lib/i18n";

export function getErrorText(
	error: unknown,
	options: RedactionOptions,
): string {
	return JSON.stringify(errorReport(error, options), null, 2);
}

export async function promptCopyError(error: unknown): Promise<void> {
	const copyOptions = await confirmCopyError(error);
	if ("abort" in copyOptions) return;
	await copyToClipboard({
		text: getErrorText(error, { redact: copyOptions.redact }),
	});
}

export async function copyToClipboard({
	text,
	copiedMessage = t("feedback.errorCopy.copied"),
}: {
	text: string;
	copiedMessage?: string;
}): Promise<void> {
	try {
		await clipboard.writeText(text);
		toast.success(copiedMessage);
	} catch (error) {
		console.error(error);
		toast.error(t("feedback.errorCopy.errors.copyFailed"));
	}
}
