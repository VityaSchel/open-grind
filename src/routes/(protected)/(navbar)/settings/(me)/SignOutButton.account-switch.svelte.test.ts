import { decode, encode } from "@msgpack/msgpack";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import { conversation, settled } from "$lib/chat/conversations-test-helpers";
import { defaultFilters } from "$lib/model/browse/grid/filters";
import { apiResponseMessageSchema } from "$lib/model/messaging/messages";

const { native, goto, page, files, push, toast } = vi.hoisted(() => ({
	native: vi.fn(),
	goto: vi.fn(),
	page: { route: { id: "/(protected)/chat" } },
	files: new Map<string, number[]>(),
	push: {
		pushAvailableHere: () => true,
		fcmServiceInstalled: () => Promise.resolve(true),
		setNotificationsEnabled: vi.fn(async () => {}),
		deletePushToken: vi.fn(async () => {}),
		shownPushConversations: vi.fn(() => Promise.resolve([])),
	},
	toast: {
		custom: vi.fn(),
		error: vi.fn(),
		warning: vi.fn(),
		success: vi.fn(),
		dismiss: vi.fn(),
	},
}));

vi.mock("@tauri-apps/api/core", () => ({
	invoke: native,
	isTauri: () => true,
}));
vi.mock("@tauri-apps/api/event", () => ({
	listen: () => Promise.resolve(() => {}),
}));
vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => "android" }));
vi.mock("$app/navigation", () => ({ goto }));
vi.mock("$app/state", () => ({ page }));
vi.mock("$lib/push", () => push);
vi.mock("svelte-sonner", () => ({ toast }));

const FIRST = 101;
const SECOND = 202;
const PEER = 7;
let profileId: number | null;
let testing: typeof import("@testing-library/svelte");

function response(body: unknown): string {
	return btoa(
		String.fromCharCode(
			...encode({
				status: 200,
				body: new TextEncoder().encode(JSON.stringify(body)),
			}),
		),
	);
}

beforeAll(async () => {
	await Promise.all([
		import("@testing-library/svelte"),
		import("$lib/chat/conversations-context.svelte"),
		import("./SignOutButton.svelte"),
		import("../../../../auth/sign-in/SignInForm.svelte"),
		import("$lib/components/feedback/GoogleHandoffConfirmAlert.svelte"),
	]);
}, 30_000);

beforeEach(async () => {
	vi.resetModules();
	vi.clearAllMocks();
	files.clear();
	localStorage.clear();
	profileId = FIRST;
	page.route.id = "/(protected)/chat";
	goto.mockImplementation((path: string) => {
		page.route.id = path.startsWith("/auth/") ? path : "/(protected)/chat";
		return Promise.resolve();
	});
	native.mockImplementation(
		(command: string, args?: Record<string, unknown>) =>
			Promise.resolve().then(() => {
				switch (command) {
					case "current_session":
						return { profileId, expiresAt: 60_000, stale: false };
					case "read_app_data":
						return files.get(String(args?.file)) ?? null;
					case "write_app_data":
						files.set(
							String(args?.file),
							Array.from(atob(String(args?.content)), (c) =>
								c.charCodeAt(0),
							),
						);
						return null;
					case "remove_app_data":
						files.delete(String(args?.file));
						return null;
					case "storage_backend":
						return "keyring";
					case "session_feature_flags":
						return [];
					case "google_handoff_pending":
					case "backend_ready":
						return true;
					case "discard_google_handoff":
						return null;
					case "sign_out":
						profileId = null;
						return null;
					case "sign_in_with_email":
					case "sign_in_with_google_handoff":
						profileId = SECOND;
						return { profileId, restriction: null };
					case "request": {
						const { path } = decode(
							Uint8Array.from(atob(String(args?.payload)), (c) =>
								c.charCodeAt(0),
							),
						) as { path: string };
						if (path.startsWith("/v1/favorites/notes/")) {
							return response({
								notes: `private note ${profileId}`,
								phoneNumber: "",
							});
						}
						if (path.startsWith("/v4/inbox?")) {
							return response({
								entries: [
									conversation(`private:${profileId}`, 1000, {
										unreadCount: 1,
										rightNow: "NOT_ACTIVE",
									}),
								],
								nextPage: null,
							});
						}
						throw new Error(`Unexpected request ${path}`);
					}
					default:
						throw new Error(`Unexpected command ${command}`);
				}
			}),
	);
	testing = await import("@testing-library/svelte");
});

afterEach(() => testing.cleanup());

async function firstAccount() {
	const preferences = await import("$lib/app-data/preferences.svelte");
	const favorites = await import("$lib/api/users/favorites");
	const conversations =
		await import("$lib/chat/conversations-context.svelte");
	const markers = await import("$lib/chat/inbox-last-viewed.svelte");
	const taps = await import("$lib/interest/taps-last-viewed");
	const incoming =
		await import("$lib/components/incoming-message-toast/incoming-message-toast-manager");
	const { load } = await import("../../../+layout");
	expect(await load({} as Parameters<typeof load>[0])).toEqual({
		ourProfileId: FIRST,
	});
	await preferences.setPreferences({
		units: "imperial",
		geohash: "u33dc0cpgp00",
		notificationsEnabled: true,
		autoUpdateLocation: true,
		gridSearchFilters: { ...defaultFilters, isFavorite: true },
	});
	markers.inboxLastViewed.save({ profileId: FIRST, at: 1000 });
	taps.tapsLastViewed.save({ profileId: FIRST, at: 2000 });
	const state = conversations.getOrCreateConversationsState(FIRST);
	await settled(state);
	expect(state.entries.map(({ data }) => data.conversationId)).toEqual([
		`private:${FIRST}`,
	]);
	state.drafts.save({
		conversationId: "shared-chat",
		text: "private first-account draft",
	});
	state.drafts.setReplyTo({
		conversationId: "shared-chat",
		messageId: "first-account-message",
	});
	expect(await favorites.getFavoriteNote({ profileId: PEER })).toMatchObject({
		notes: `private note ${FIRST}`,
	});
	incoming.showIncomingMessageToast({
		conversationId: `private:${FIRST}`,
		message: apiResponseMessageSchema.parse({
			messageId: "first-account-message",
			conversationId: `private:${FIRST}`,
			senderId: PEER,
			timestamp: 1000,
			type: "Text",
			body: { text: "private first-account message" },
		}),
	});
	return { preferences, favorites, conversations, markers, taps, state };
}

async function assertSecondAccount(
	app: Awaited<ReturnType<typeof firstAccount>>,
) {
	const { signedInProfileId } = await import("$lib/api/current-session");
	expect(await signedInProfileId()).toBe(SECOND);
	const { load } = await import("../../../+layout");
	expect(await load({} as Parameters<typeof load>[0])).toEqual({
		ourProfileId: SECOND,
	});
	expect(app.preferences.preferencesSnapshot()).toMatchObject({
		units: "imperial",
		geohash: null,
		notificationsEnabled: false,
		autoUpdateLocation: false,
	});
	expect(app.markers.inboxLastViewed.load(FIRST)).toBe(0);
	expect(app.taps.tapsLastViewed.load(FIRST)).toBe(0);
	expect(
		app.preferences.preferencesSnapshot().gridSearchFilters,
	).toBeUndefined();
	expect(app.state.drafts.get("shared-chat")).toBe("");
	expect(app.state.drafts.replyTo("shared-chat")).toBeNull();
	expect(toast.dismiss).toHaveBeenCalledWith(`private:${FIRST}`);
	expect(push.setNotificationsEnabled).toHaveBeenCalledWith(false);
	expect(push.deletePushToken).toHaveBeenCalledOnce();
	expect(
		await app.favorites.getFavoriteNote({ profileId: PEER }),
	).toMatchObject({ notes: `private note ${SECOND}` });
	const next = app.conversations.getOrCreateConversationsState(SECOND);
	expect(next).not.toBe(app.state);
	await settled(next);
	expect(next.ourProfileId).toBe(SECOND);
	expect(next.entries.map(({ data }) => data.conversationId)).toEqual([
		`private:${SECOND}`,
	]);
	expect(next.drafts.get("shared-chat")).toBe("");
	expect(next.drafts.replyTo("shared-chat")).toBeNull();
	app.state.drafts.save({
		conversationId: "shared-chat",
		text: "late first-account draft",
	});
	expect(app.state.drafts.get("shared-chat")).toBe("");
	expect(next.drafts.get("shared-chat")).toBe("");
	const stored = files.get("preferences");
	expect(stored).toBeDefined();
	await next.destroy();
	vi.resetModules();
	const restarted = await import("$lib/app-data/preferences.svelte");
	await restarted.hydratePreferences();
	expect(restarted.preferencesSnapshot()).toMatchObject({
		units: "imperial",
		geohash: null,
		notificationsEnabled: false,
		autoUpdateLocation: false,
	});
	expect(restarted.preferencesSnapshot().gridSearchFilters).toBeUndefined();
}

describe("account changes through the real auth, cache and preferences flow", () => {
	it("signs out through the confirmation and signs in as a different account without leaking private state", async () => {
		const { render, fireEvent, screen, cleanup } = testing;
		const app = await firstAccount();
		const { default: SignOutButton } =
			await import("./SignOutButton.svelte");
		render(SignOutButton);
		await fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
		await fireEvent.click(
			await screen.findByRole("button", { name: "Continue" }),
		);
		await vi.waitFor(() =>
			expect(screen.queryByRole("alertdialog")).toBeNull(),
		);
		await vi.waitFor(() =>
			expect(app.preferences.preferencesSnapshot()).toMatchObject({
				notificationsEnabled: false,
				geohash: null,
			}),
		);
		expect(profileId).toBeNull();
		expect(goto).toHaveBeenCalledWith("/auth/sign-in");
		cleanup();
		const { default: SignInForm } =
			await import("../../../../auth/sign-in/SignInForm.svelte");
		render(SignInForm);
		await fireEvent.input(screen.getByLabelText("Email"), {
			target: { value: "second@example.com" },
		});
		await fireEvent.input(screen.getByLabelText("Password"), {
			target: { value: "second-password" },
		});
		await fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
		await vi.waitFor(() => expect(goto).toHaveBeenLastCalledWith("/"));
		await assertSecondAccount(app);
	});

	it("confirms a Google account switch and signs in without leaking private state", async () => {
		const { render, fireEvent, screen } = testing;
		const app = await firstAccount();
		const { consumeGoogleHandoff } =
			await import("$lib/api/google-handoff");
		const { default: Confirm } =
			await import("$lib/components/feedback/GoogleHandoffConfirmAlert.svelte");
		render(Confirm);
		const switching = consumeGoogleHandoff();
		await fireEvent.click(
			await screen.findByRole("button", { name: "Continue" }),
		);
		await switching;
		expect(native).toHaveBeenCalledWith("sign_out", undefined);
		expect(native).toHaveBeenCalledWith("sign_in_with_google_handoff");
		expect(native).not.toHaveBeenCalledWith("discard_google_handoff");
		expect(goto).toHaveBeenCalledWith("/auth/sign-in/google");
		expect(goto).toHaveBeenLastCalledWith("/");
		await vi.waitFor(() =>
			expect(screen.queryByRole("alertdialog")).toBeNull(),
		);
		expect(toast.error).not.toHaveBeenCalled();
		await assertSecondAccount(app);
	});
});
