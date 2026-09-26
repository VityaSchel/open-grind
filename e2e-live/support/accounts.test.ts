import { describe, expect, it } from "vitest";

import {
	assertLiveRequest,
	assertLiveWrite,
	assertSignedInAsApp,
	conversationIdBetween,
	liveAccounts,
	LiveGuardError,
} from "./accounts";

const ownerMainAccount = 852120758;

describe("live-account guard", () => {
	it("allows writes between the two burners", () => {
		expect(() =>
			assertLiveWrite({
				actor: liveAccounts.app,
				target: liveAccounts.counterpart,
			}),
		).not.toThrow();
		expect(() =>
			assertLiveWrite({
				actor: liveAccounts.counterpart,
				target: liveAccounts.app,
			}),
		).not.toThrow();
	});

	it("allows the app burner to write to itself", () => {
		expect(() =>
			assertLiveWrite({
				actor: liveAccounts.app,
				target: liveAccounts.app,
			}),
		).not.toThrow();
	});

	it("refuses a write that targets the owner's account", () => {
		expect(() =>
			assertLiveWrite({
				actor: liveAccounts.app,
				target: ownerMainAccount,
			}),
		).toThrow(LiveGuardError);
	});

	it("refuses a write made as the owner's account", () => {
		expect(() =>
			assertLiveWrite({
				actor: ownerMainAccount,
				target: liveAccounts.app,
			}),
		).toThrow(LiveGuardError);
	});

	it("refuses any account outside the two burners", () => {
		expect(() =>
			assertLiveWrite({ actor: liveAccounts.counterpart, target: 1 }),
		).toThrow(LiveGuardError);
	});

	it("allows a request about the conversation between the burners", () => {
		expect(() =>
			assertLiveRequest({
				path: "/v4/chat/conversation/858049792:880215879",
				body: { text: "og-e2e-hello" },
			}),
		).not.toThrow();
	});

	it("refuses a request about a conversation with anyone else", () => {
		expect(() =>
			assertLiveRequest({
				path: `/v4/chat/conversation/${ownerMainAccount}:${liveAccounts.app}`,
			}),
		).toThrow(LiveGuardError);
		expect(() =>
			assertLiveRequest({
				path: `/v4/chat/conversation/${liveAccounts.app}:123456789`,
			}),
		).toThrow(LiveGuardError);
	});

	it("refuses a request whose body names the owner's account", () => {
		expect(() =>
			assertLiveRequest({
				path: "/v4/chat/message/send",
				body: { target: { targetId: ownerMainAccount } },
			}),
		).toThrow(LiveGuardError);
	});

	it("aborts unless the app is signed in as the app burner", () => {
		expect(() => assertSignedInAsApp(liveAccounts.app)).not.toThrow();
		expect(() => assertSignedInAsApp(ownerMainAccount)).toThrow(
			LiveGuardError,
		);
		expect(() => assertSignedInAsApp(liveAccounts.counterpart)).toThrow(
			LiveGuardError,
		);
		expect(() => assertSignedInAsApp(null)).toThrow(LiveGuardError);
	});

	it("builds the conversation id with the lower profile id first", () => {
		expect(
			conversationIdBetween(liveAccounts.counterpart, liveAccounts.app),
		).toBe("858049792:880215879");
	});
});
