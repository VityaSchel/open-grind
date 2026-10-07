import { flushSync } from "svelte";
import { toast } from "svelte-sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE, t } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import { showPersistentErrorToast } from "./persistent-error-toast";

const SERVER_TEXT = "connection reset";

const message = () => t("feedback.sessionRecovery.retrying");

let id = "";
let shownToasts = 0;

function shown() {
	return toast.getActiveToasts().filter((active) => active.id === id);
}

async function switchLocale(locale: string): Promise<void> {
	await setLocale({ locale });
	flushSync();
}

beforeEach(() => {
	shownToasts += 1;
	id = `persistent-${shownToasts}`;
});

afterEach(async () => {
	vi.restoreAllMocks();
	toast.dismiss();
	await switchLocale(SOURCE_LOCALE);
});

describe("showPersistentErrorToast", () => {
	it("shows the message as an error that stays until dismissed", () => {
		showPersistentErrorToast({ id, message });

		expect(shown()).toMatchObject([
			{
				type: "error",
				title: message(),
				duration: Number.POSITIVE_INFINITY,
			},
		]);
	});

	it("shows the toast once while the locale stays", () => {
		const error = vi.spyOn(toast, "error");
		showPersistentErrorToast({ id, message });

		flushSync();

		expect(error).toHaveBeenCalledOnce();
	});

	it("rewords the toast in place after a locale switch", async () => {
		showPersistentErrorToast({ id, message });

		await switchLocale("en-XA");

		expect(shown().map((active) => active.title)).toStrictEqual([
			expect.stringMatching(PSEUDO_MESSAGE),
		]);
	});

	it("leaves a dismissed toast down after a locale switch", async () => {
		const error = vi.spyOn(toast, "error");
		showPersistentErrorToast({ id, message });
		toast.dismiss(id);

		await switchLocale("en-XA");

		expect(error).toHaveBeenCalledOnce();
	});

	it("stops following a toast once it is gone", async () => {
		const reword = vi.fn(message);
		showPersistentErrorToast({ id, message: reword });
		toast.dismiss(id);
		await switchLocale("en-XA");
		reword.mockClear();

		await switchLocale(SOURCE_LOCALE);

		expect(reword).not.toHaveBeenCalled();
	});

	it("leaves a toast that other text took over", async () => {
		showPersistentErrorToast({ id, message });
		toast.error(SERVER_TEXT, { id });

		await switchLocale("en-XA");

		expect(shown().map((active) => active.title)).toStrictEqual([
			SERVER_TEXT,
		]);
	});

	it("follows only the latest toast shown under an id", async () => {
		const reword = vi.fn(message);
		showPersistentErrorToast({ id, message: reword });
		showPersistentErrorToast({ id, message: reword });
		flushSync();
		reword.mockClear();

		await switchLocale("en-XA");

		expect(reword).toHaveBeenCalledOnce();
	});
});
