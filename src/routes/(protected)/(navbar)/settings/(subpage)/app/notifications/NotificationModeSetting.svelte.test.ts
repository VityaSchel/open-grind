// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notificationState } from "#lib/push/notification-state.svelte.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import type * as Preferences from "#lib/app-data/preferences.svelte.ts";
import type { NotificationMode } from "#lib/push/types.ts";
import NotificationModeSetting from "./NotificationModeSetting.svelte";

const { selectNotificationMode } = vi.hoisted(() => ({
	selectNotificationMode: vi.fn<(mode: NotificationMode) => Promise<void>>(),
}));

vi.mock("#lib/push/delivery.svelte.ts", () => ({
	selectNotificationMode,
	continueToAddon: vi.fn(),
	dismissAddonDialog: vi.fn(),
}));
vi.mock("#lib/app-data/preferences.svelte.ts", async (importOriginal) => ({
	...(await importOriginal<typeof Preferences>()),
	preferencesSnapshot: () => ({ notificationsEnabled: true }),
}));

function mode(name: RegExp): HTMLElement {
	return screen.getByRole("option", { name });
}

const fast = () => mode(/^Fast Mode/);
const slow = () => mode(/^Slow Mode/);

beforeEach(() => {
	runningOn("linux");
	Object.assign(notificationState, {
		mode: "slow",
		phase: "idle",
		permissionPending: false,
		addonDialog: null,
	});
	selectNotificationMode.mockReset();
});

afterEach(() => {
	cleanup();
	resetPlatform();
});

describe("the delivery mode list from the keyboard", () => {
	it("is one Tab stop that rests on the selected mode", () => {
		render(NotificationModeSetting);

		expect(slow().getAttribute("tabindex")).toBe("0");
		expect(fast().getAttribute("tabindex")).toBe("-1");
	});

	it("moves focus with the arrow keys without changing the mode", async () => {
		render(NotificationModeSetting);
		slow().focus();

		await fireEvent.keyDown(slow(), { key: "ArrowDown" });
		await tick();

		expect(document.activeElement).toBe(fast());
		expect(slow().getAttribute("aria-selected")).toBe("true");
		expect(fast().getAttribute("aria-selected")).toBe("false");
		expect(selectNotificationMode).not.toHaveBeenCalled();
	});

	it("keeps focus on the chosen mode while it applies", async () => {
		const applying = Promise.withResolvers<void>();
		selectNotificationMode.mockImplementation(() => {
			notificationState.phase = "enablingFast";
			return applying.promise;
		});
		render(NotificationModeSetting);
		fast().focus();

		await fireEvent.click(fast(), { detail: 0 });
		await tick();

		expect(selectNotificationMode).toHaveBeenCalledWith("fast");
		expect(document.activeElement).toBe(fast());
		expect(fast().getAttribute("aria-disabled")).toBe("true");
		expect(fast().getAttribute("aria-busy")).toBe("true");
		expect(fast().hasAttribute("disabled")).toBe(false);
		expect(slow().hasAttribute("disabled")).toBe(false);
		applying.resolve();
	});

	it("ignores a choice while another mode is still applying", async () => {
		notificationState.phase = "working";
		render(NotificationModeSetting);
		fast().focus();

		await fireEvent.click(fast(), { detail: 0 });

		expect(selectNotificationMode).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(fast());
	});
});
