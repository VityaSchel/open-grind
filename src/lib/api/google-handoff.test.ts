import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	invoke: vi.fn(),
	signedInProfileId: vi.fn(),
	confirmAccountSwitch: vi.fn(),
	signOut: vi.fn(),
	finishSignIn: vi.fn(),
	reportSignInFailure: vi.fn(),
	goto: vi.fn(),
	toastError: vi.fn(),
	handoff: { phase: "idle" },
	events: [] as string[],
}));

vi.mock("@tauri-apps/api/core", () => ({
	invoke: mocks.invoke,
	isTauri: () => true,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("$app/navigation", () => ({ goto: mocks.goto }));
vi.mock("svelte-sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("$lib/api/google-handoff-state.svelte", () => ({
	confirmAccountSwitch: mocks.confirmAccountSwitch,
	googleHandoffState: mocks.handoff,
}));
vi.mock("$lib/api/current-session", () => ({
	signedInProfileId: mocks.signedInProfileId,
}));
vi.mock("$lib/api/sign-in", () => ({
	finishSignIn: mocks.finishSignIn,
	reportSignInFailure: mocks.reportSignInFailure,
}));
vi.mock("$lib/api/sign-out", () => ({ signOut: mocks.signOut }));

import { consumeGoogleHandoff } from "$lib/api/google-handoff";

const SIGNED_IN_AS = 42;
const NEW_ACCOUNT = { profileId: 7, restriction: null };
const GOOGLE_SIGN_IN = "/auth/sign-in/google";

function backend({
	exchange,
	pending = () => true,
}: {
	exchange: () => unknown;
	pending?: () => boolean;
}) {
	const replies: Record<string, () => unknown> = {
		google_handoff_pending: pending,
		backend_ready: () => true,
		sign_in_with_google_handoff: exchange,
		discard_google_handoff: () => undefined,
	};
	mocks.invoke.mockImplementation((command: string) => {
		mocks.events.push(command);
		const reply = replies[command];
		if (!reply) {
			return Promise.reject(new Error(`unexpected command ${command}`));
		}
		return Promise.resolve().then(reply);
	});
}

function answerSwitch(accepted: boolean) {
	mocks.confirmAccountSwitch.mockImplementation(() => {
		mocks.handoff.phase = accepted ? "switchingAccount" : "idle";
		return Promise.resolve(accepted);
	});
}

beforeEach(() => {
	for (const mock of Object.values(mocks)) {
		if (typeof mock === "function") mock.mockReset();
	}
	mocks.events.length = 0;
	mocks.handoff.phase = "idle";
	mocks.signedInProfileId.mockResolvedValue(SIGNED_IN_AS);
	mocks.signOut.mockImplementation((options: unknown) => {
		mocks.events.push(`signOut ${JSON.stringify(options)}`);
		return Promise.resolve();
	});
	mocks.finishSignIn.mockImplementation(() => {
		mocks.events.push("finishSignIn");
	});
	mocks.reportSignInFailure.mockImplementation(() => {
		mocks.events.push("reportSignInFailure");
	});
});

describe("switching accounts through a Google handoff", () => {
	it("signs the current account out onto the Google sign-in page before exchanging the handoff", async () => {
		answerSwitch(true);
		backend({ exchange: () => NEW_ACCOUNT });

		await consumeGoogleHandoff();

		expect(mocks.events).toEqual([
			"google_handoff_pending",
			"backend_ready",
			"google_handoff_pending",
			`signOut {"destination":"${GOOGLE_SIGN_IN}"}`,
			"sign_in_with_google_handoff",
			"finishSignIn",
		]);
		expect(mocks.finishSignIn).toHaveBeenCalledWith(NEW_ACCOUNT);
	});

	it("keeps the current account and discards the handoff when the switch is declined", async () => {
		answerSwitch(false);
		backend({ exchange: () => NEW_ACCOUNT });

		await consumeGoogleHandoff();

		expect(mocks.events).toEqual([
			"google_handoff_pending",
			"backend_ready",
			"discard_google_handoff",
		]);
		expect(mocks.goto).not.toHaveBeenCalled();
	});

	it("leaves a refused sign-in's dialog in place instead of clearing it", async () => {
		answerSwitch(true);
		backend({
			exchange: () => {
				throw new Error("banned");
			},
		});

		await consumeGoogleHandoff();

		expect(mocks.events.at(-1)).toBe("reportSignInFailure");
		expect(mocks.finishSignIn).not.toHaveBeenCalled();
	});

	it("keeps the current account when the handoff expires while the switch is being confirmed", async () => {
		answerSwitch(true);
		let checks = 0;
		backend({ exchange: () => NEW_ACCOUNT, pending: () => ++checks === 1 });

		await consumeGoogleHandoff();

		expect(mocks.signOut).not.toHaveBeenCalled();
		expect(mocks.events).not.toContain("sign_in_with_google_handoff");
		expect(mocks.toastError).toHaveBeenCalledOnce();
		expect(mocks.handoff.phase).toBe("idle");
	});

	it("stays on the Google sign-in page when the handoff expired after the switch", async () => {
		answerSwitch(true);
		backend({ exchange: () => null });

		await consumeGoogleHandoff();

		expect(mocks.toastError).toHaveBeenCalledOnce();
		expect(mocks.finishSignIn).not.toHaveBeenCalled();
		expect(mocks.goto).not.toHaveBeenCalled();
	});
});

describe("signing in through a Google handoff with no account", () => {
	it("goes to the Google sign-in page without signing anything out", async () => {
		mocks.signedInProfileId.mockResolvedValue(null);
		backend({ exchange: () => NEW_ACCOUNT });

		await consumeGoogleHandoff();

		expect(mocks.confirmAccountSwitch).not.toHaveBeenCalled();
		expect(mocks.signOut).not.toHaveBeenCalled();
		expect(mocks.goto).toHaveBeenCalledWith(GOOGLE_SIGN_IN);
		expect(mocks.events).toEqual([
			"google_handoff_pending",
			"backend_ready",
			"sign_in_with_google_handoff",
			"finishSignIn",
		]);
	});
});
