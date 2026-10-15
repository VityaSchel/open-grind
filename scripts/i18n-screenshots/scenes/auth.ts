import type { Locator, Page } from "@playwright/test";

import type {
	MethodFault,
	NativeError,
} from "../../../src/lib/demo/screenshot-scene";
import type { Scene, SceneView } from ".";
import { changeScene } from "./drive";
import { fillSignIn } from "./session";
import { addingToast } from "./toast";
import { visit } from "./visit";

type SignInButton = "email" | "google" | "facebook";

type SignInAttempt = { button: SignInButton; faults: MethodFault[] };

const SIGN_IN_COMMANDS = {
	email: "sign_in_with_email",
	google: "sign_in_with_google",
	facebook: "sign_in_with_facebook",
} as const satisfies Record<SignInButton, string>;

const UNAUTHORIZED: NativeError = { kind: "Unauthorized" };
const CAPTCHA_REASONS = [
	"unsupportedPlatform",
	"addonUnavailable",
	"addonDisabled",
	"addonUntrusted",
	"grindrMissing",
	"failed",
];

function signInButton({
	page,
	button,
}: {
	page: Page;
	button: SignInButton;
}): Locator {
	switch (button) {
		case "email":
			return page.locator("form button[type=submit]");
		case "google":
			return page.getByRole("button", { name: "Sign in with Google" });
		case "facebook":
			return page.getByRole("button", { name: "Sign in with Facebook" });
	}
}

function failing({
	button,
	error,
}: {
	button: SignInButton;
	error: NativeError;
}): SignInAttempt {
	return { button, faults: [{ command: SIGN_IN_COMMANDS[button], error }] };
}

function authFailing({
	button,
	message,
}: {
	button: SignInButton;
	message: string;
}): SignInAttempt {
	return failing({ button, error: { kind: "Auth", message } });
}

function captchaFailing(reason: string): SignInAttempt {
	return {
		button: "email",
		faults: [
			{ command: SIGN_IN_COMMANDS.email, error: UNAUTHORIZED },
			{
				command: "mint_recaptcha_token",
				error: { kind: "Recaptcha", message: { reason } },
			},
		],
	};
}

async function failSignIns({
	page,
	attempts,
}: {
	page: Page;
	attempts: SignInAttempt[];
}): Promise<void> {
	for (const { button, faults } of attempts) {
		await changeScene({ page, scene: { methodFaults: faults } });
		await addingToast({
			page,
			action: () => signInButton({ page, button }).dispatchEvent("click"),
		});
	}
}

function failingView({
	id,
	attempts,
	opensSignIn = false,
}: {
	id: string;
	attempts: SignInAttempt[];
	opensSignIn?: boolean;
}): SceneView {
	return {
		id,
		screen: "auth/sign-in",
		survivesLocaleSwitch: false,
		drive: async (page) => {
			if (opensSignIn) await fillSignIn(page);
			await failSignIns({ page, attempts });
		},
	};
}

export const signIn: Scene = {
	platform: "phone",
	demo: { signedOut: true },
	views: [
		{
			id: "auth/sign-in",
			drive: (page) =>
				visit({
					page,
					path: "/auth/sign-in",
					ready: page.locator("form button[type=submit]"),
				}),
		},
	],
};

export const signInRefusals: Scene = {
	platform: "phone",
	demo: { signedOut: true },
	views: [
		failingView({
			id: "auth/sign-in/refused",
			opensSignIn: true,
			attempts: [
				failing({ button: "email", error: UNAUTHORIZED }),
				authFailing({
					button: "email",
					message: "account not registered",
				}),
				failing({ button: "email", error: { kind: "RateLimited" } }),
			],
		}),
		failingView({
			id: "auth/sign-in/provider-failures",
			attempts: [
				authFailing({ button: "google", message: "companion-failed" }),
				authFailing({
					button: "facebook",
					message: "sign-in-in-progress",
				}),
				authFailing({
					button: "facebook",
					message: "sign-in-flow-ended",
				}),
			],
		}),
		failingView({
			id: "auth/sign-in/facebook-failures",
			attempts: [
				"facebook-dialog-error",
				"facebook-handoff-refused",
				"facebook-unverified",
			].map((message) => authFailing({ button: "facebook", message })),
		}),
		failingView({
			id: "auth/sign-in/timeout-and-companion",
			attempts: [
				authFailing({
					button: "facebook",
					message: "facebook-timed-out",
				}),
				authFailing({
					button: "google",
					message: "companion-disabled",
				}),
			],
		}),
	],
};

export const captchaRefusals: Scene = {
	platform: "phone",
	demo: {
		signedOut: true,
		methodAnswers: { recaptcha_first_party_enabled: true },
	},
	views: [
		failingView({
			id: "auth/sign-in/captcha-helper",
			opensSignIn: true,
			attempts: CAPTCHA_REASONS.slice(0, 3).map(captchaFailing),
		}),
		failingView({
			id: "auth/sign-in/captcha-checks",
			attempts: CAPTCHA_REASONS.slice(3).map(captchaFailing),
		}),
	],
};

export const unimplementedAuthPages: Scene = {
	platform: "phone",
	demo: { signedOut: true },
	views: [
		{
			id: "auth/password-reset",
			drive: (page) =>
				visit({
					page,
					path: "/auth/password-reset",
					ready: page.getByText("Unimplemented"),
				}),
		},
		{
			id: "auth/sign-up",
			drive: (page) =>
				visit({
					page,
					path: "/auth/sign-up",
					ready: page.getByText("Unimplemented"),
				}),
		},
	],
};

export const onboarding: Scene = {
	platform: "phone",
	demo: { onboarding: true, updates: true },
	views: [
		{
			id: "onboarding",
			drive: (page) =>
				visit({
					page,
					path: "/onboarding",
					ready: page.getByRole("main").getByRole("button"),
				}),
		},
	],
};

export const linuxOnboarding: Scene = {
	platform: "desktop",
	shim: "linux",
	demo: { onboarding: true, updates: true },
	native: {
		desktop_entry_state: { answer: { available: true, installed: false } },
		desktop_entry_install: {
			reject: "The applications folder is read-only",
		},
		write_app_data: { reject: "No space left on the device" },
	},
	views: [
		{
			id: "onboarding/linux",
			drive: (page) =>
				visit({
					page,
					path: "/onboarding",
					ready: page.getByText("Add Open Grind to your apps menu"),
				}),
		},
		{
			id: "onboarding/linux/failed",
			screen: "onboarding/linux",
			survivesLocaleSwitch: false,
			drive: async (page) => {
				await addingToast({
					page,
					action: () =>
						page
							.getByRole("button", { name: "Get started" })
							.click(),
				});
				await page.getByText("Couldn’t finish setup").waitFor();
			},
		},
	],
};
