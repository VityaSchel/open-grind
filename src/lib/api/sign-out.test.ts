import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];

const { goto, callMethod, caches, preferences, markers, push } = vi.hoisted(
	() => ({
		goto: vi.fn(() => Promise.resolve()),
		callMethod: vi.fn(() => Promise.resolve(null)),
		caches: { clearAccountCaches: vi.fn() },
		preferences: {
			clearAccountPreferences: vi.fn(() => Promise.resolve()),
		},
		markers: { clearStored: vi.fn() },
		push: {
			currentMode: vi.fn(() => Promise.resolve("slow")),
			deletePushToken: vi.fn(() => Promise.resolve()),
			setNotificationsEnabled: vi.fn(() => Promise.resolve()),
		},
	}),
);

vi.mock("$app/navigation", () => ({ goto }));
vi.mock("$lib/api/methods", () => ({ callMethod }));
vi.mock("$lib/api/account-caches", () => caches);
vi.mock("$lib/app-data/preferences.svelte", () => preferences);
vi.mock("$lib/chat/inbox-last-viewed.svelte", () => ({
	inboxLastViewed: markers,
}));
vi.mock("$lib/interest/taps-last-viewed", () => ({ tapsLastViewed: markers }));
vi.mock("$lib/push", () => push);

async function freshModule() {
	vi.resetModules();
	return await import("./sign-out");
}

beforeEach(() => {
	vi.clearAllMocks();
	order.length = 0;
	callMethod.mockImplementation(() => {
		order.push("sign_out");
		return Promise.resolve(null);
	});
});

describe("signing out", () => {
	it("lets registered releases run while the session is still usable", async () => {
		const module = await freshModule();
		module.onSignOut(() => {
			order.push("release");
			return Promise.resolve();
		});

		await module.signOut();

		expect(order).toEqual(["release", "sign_out"]);
	});

	it("signs out anyway when a release fails", async () => {
		const module = await freshModule();
		module.onSignOut(() => Promise.reject(new Error("no add-on")));

		await module.signOut();

		expect(callMethod).toHaveBeenCalledWith("sign_out");
		expect(goto).toHaveBeenCalledWith("/auth/sign-in");
	});

	it("runs every release once, however often it was registered", async () => {
		const module = await freshModule();
		const release = vi.fn(() => Promise.resolve());
		module.onSignOut(release);
		module.onSignOut(release);

		await module.signOut();

		expect(release).toHaveBeenCalledOnce();
	});

	it("stops notifications for this account even in slow mode", async () => {
		const module = await freshModule();

		await module.clearAccountState();

		expect(push.setNotificationsEnabled).toHaveBeenCalledWith(false);
	});

	it("drops the firebase token only where push was turned on", async () => {
		const module = await freshModule();

		await module.clearAccountState();
		expect(push.deletePushToken).not.toHaveBeenCalled();

		push.currentMode.mockResolvedValue("fast");
		await module.clearAccountState();
		expect(push.deletePushToken).toHaveBeenCalled();
	});
});
