import * as clipboard from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "svelte-sonner";

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
		toast.success("Error details copied to clipboard");
	} catch (error) {
		console.error(error);
		toast.error("Couldn't copy to clipboard");
	}
}
