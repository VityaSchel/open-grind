import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PushErrorReason, PushToken } from "./types";

type PushWatcher = (event: {
	deeplinkPending: boolean;
	tokenChanged: boolean;
}) => void;

const goto = vi.hoisted(() => vi.fn<(route: string) => Promise<void>>());
const signOut = vi.hoisted(() => ({
	onSignOut: vi.fn<(release: () => Promise<void>) => void>(),
}));
const account = vi.hoisted(() => ({
	registerPushToken: vi.fn<(token: PushToken) => Promise<void>>(),
}));
const teardown = vi.hoisted(() => ({
	forgetPushRegistration: vi.fn<() => Promise<void>>(),
}));
const push = vi.hoisted(() => ({
	currentMode: vi.fn<() => Promise<"slow" | "fast">>(),
	mintPushToken: vi.fn<() => Promise<PushToken>>(),
	notificationsEnabled: vi.fn<() => Promise<boolean>>(),
	pushAvailableHere: vi.fn(() => true),
	pushErrorReason: vi.fn<(error: unknown) => PushErrorReason | null>(),
	setMode: vi.fn<(mode: "slow" | "fast") => Promise<void>>(),
	takePushDeeplink: vi.fn<() => Promise<string | null>>(),
	watchPush: vi.fn<(watcher: PushWatcher) => Promise<void>>(),
}));

vi.mock("$app/navigation", () => ({ goto }));
vi.mock("$lib/api/sign-out", () => signOut);
vi.mock("$lib/api/settings/account", () => account);
vi.mock("./teardown", () => teardown);
vi.mock("./index", () => push);

const token: PushToken = {
	token: "fid:APA91b",
	vendorProvidedIdentifier: "fid",
};

async function freshModule() {
	vi.resetModules();
	return await import("./watch");
}

beforeEach(() => {
	vi.clearAllMocks();
	push.pushAvailableHere.mockReturnValue(true);
	push.currentMode.mockResolvedValue("fast");
	push.mintPushToken.mockResolvedValue(token);
	push.notificationsEnabled.mockResolvedValue(true);
	push.takePushDeeplink.mockResolvedValue(null);
	push.watchPush.mockResolvedValue(undefined);
	push.setMode.mockResolvedValue(undefined);
	account.registerPushToken.mockResolvedValue(undefined);
	push.pushErrorReason.mockReturnValue("failed");
	vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("watching push", () => {
	it("stays out of the way where push cannot work", async () => {
		push.pushAvailableHere.mockReturnValue(false);
		const module = await freshModule();

		await module.startPushWatch();

		expect(push.watchPush).not.toHaveBeenCalled();
		expect(signOut.onSignOut).not.toHaveBeenCalled();
	});

	it("does not re-register a device whose owner turned notifications off", async () => {
		push.notificationsEnabled.mockResolvedValue(false);
		const module = await freshModule();

		await module.startPushWatch();

		expect(account.registerPushToken).not.toHaveBeenCalled();
	});

	it("hands sign-out the release that drops the registration", async () => {
		const module = await freshModule();

		await module.startPushWatch();

		expect(signOut.onSignOut).toHaveBeenCalledWith(
			teardown.forgetPushRegistration,
		);
	});

	it("opens a deeplink that arrived while the webview was dead", async () => {
		push.takePushDeeplink.mockResolvedValue(
			"grindr://conversation?id=1:2&senderId=2",
		);
		const module = await freshModule();

		await module.startPushWatch();

		expect(goto).toHaveBeenCalledWith("/chat/1%3A2");
	});

	it("leaves the token alone in slow mode", async () => {
		push.currentMode.mockResolvedValue("slow");
		const module = await freshModule();

		await module.startPushWatch();

		expect(push.mintPushToken).not.toHaveBeenCalled();
		expect(account.registerPushToken).not.toHaveBeenCalled();
	});

	it("registers the rotated token when the add-on reports one", async () => {
		const module = await freshModule();
		await module.startPushWatch();
		account.registerPushToken.mockClear();

		const [watcher] = push.watchPush.mock.calls[0] ?? [];
		watcher?.({ deeplinkPending: false, tokenChanged: true });
		await vi.waitFor(() => {
			expect(account.registerPushToken).toHaveBeenCalledWith(token);
		});
	});

	it("falls back to slow mode once the add-on is gone", async () => {
		account.registerPushToken.mockRejectedValue(new Error("no add-on"));
		push.pushErrorReason.mockReturnValue("addonUntrusted");
		const module = await freshModule();

		await module.startPushWatch();

		expect(push.setMode).toHaveBeenCalledWith("slow");
	});

	it("keeps fast mode through a failure the add-on did not cause", async () => {
		account.registerPushToken.mockRejectedValue(new Error("offline"));
		push.pushErrorReason.mockReturnValue("failed");
		const module = await freshModule();

		await module.startPushWatch();

		expect(push.setMode).not.toHaveBeenCalled();
	});
});
