import type { Page } from "@playwright/test";

import type {
	NativeError,
	RestFault,
} from "../../../src/lib/demo/screenshot-scene";
import { overrideNative } from "../stubs";

export const CONNECT_FAILED: NativeError = { kind: "Connect" };
export const STORAGE_FULL = "No space left on the device";
const APP_CHUNKS = "**/_app/immutable/chunks/*.js";

export function failing({
	method,
	path,
}: {
	method: string;
	path: RestFault["path"];
}): RestFault {
	return { method, path, error: CONNECT_FAILED };
}

export function failClipboard(page: Page): Promise<void> {
	return overrideNative({
		page,
		overrides: {
			"plugin:clipboard-manager|write_text": {
				reject: "Clipboard unavailable",
			},
		},
	});
}

export async function failChunks({
	page,
	containing,
}: {
	page: Page;
	containing?: string;
}): Promise<void> {
	await page.route(APP_CHUNKS, async (route) => {
		if (containing === undefined) {
			await route.abort("failed");
			return;
		}
		const response = await route.fetch();
		const body = await response.text();
		if (body.includes(containing)) {
			await route.abort("failed");
			return;
		}
		await route.fulfill({ response, body });
	});
}
