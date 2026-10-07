// @vitest-environment jsdom

import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import { SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import {
	installedBy,
	offer,
	settled,
	toastsFake,
	updateApiFake,
} from "$lib/updates/updates-test-helpers";
import type { Capability } from "$lib/updates/types";

const ASCII_LETTER = /[A-Za-z]/;

const fake = updateApiFake();
const toasts = toastsFake();
const { api } = fake;
const {
	callMethodMock,
	pageMock,
	toastMock,
	platform,
	store,
	getUpdateCapability,
} = vi.hoisted(() => ({
	getUpdateCapability: vi.fn<() => Promise<Capability>>(),
	callMethodMock: vi.fn(),
	pageMock: { url: new URL("http://localhost/") },
	toastMock: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
	platform: { isAndroidPlatform: vi.fn(() => true) },
	store: { isPlayBuild: vi.fn(() => false) },
}));

vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$app/state", () => ({ page: pageMock }));
vi.mock("$lib/api/methods", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/methods")>()),
	callMethod: callMethodMock,
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));
vi.mock("$lib/updates/index", async () => ({
	...(await import("$lib/updates/types")),
	...(await import("$lib/updates/components")),
	...fake.api,
	getUpdateCapability,
}));
vi.mock("$lib/updates/toasts", () => toasts);
vi.mock("$lib/platform/os", () => platform);
vi.mock("$lib/platform/store", () => store);
vi.mock("$lib/platform/link-opener", () => ({ openExternalLink: vi.fn() }));

let testing: typeof import("@testing-library/svelte");

const releaseSigned: Capability = {
	state: "supported",
	detail: { payloadSuffix: "-android.apk", canInstallNow: true },
};

async function opened() {
	testing = await import("@testing-library/svelte");
	const { hydrateUpdateCapability } =
		await import("$lib/updates/capability.svelte");
	await hydrateUpdateCapability();
	const { default: GoogleSignInForm } =
		await import("./GoogleSignInForm.svelte");
	const { container } = testing.render(GoogleSignInForm);
	await settled();
	return { container, screen: testing.screen };
}

function textOf(node: Node | null | undefined) {
	return (node?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function slot(container: HTMLElement, name: string) {
	return container.querySelector(`[data-slot="${name}"]`);
}

function companionLink() {
	return testing.screen.getByRole("link", {
		name: "Open Grind Google OAuth app",
	});
}

async function switchLocale(locale: string) {
	const { setLocale } = await import("$lib/i18n");
	await setLocale({ locale });
}

function expectPseudo(lines: readonly (Node | null | undefined)[]) {
	for (const line of lines) expect(textOf(line)).toMatch(PSEUDO_MESSAGE);
}

describe("GoogleSignInForm in the active locale", () => {
	beforeAll(async () => {
		await import("@testing-library/svelte");
		await import("./GoogleSignInForm.svelte");
	}, 30_000);

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		fake.reset();
		pageMock.url.search = "";
		platform.isAndroidPlatform.mockReturnValue(true);
		store.isPlayBuild.mockReturnValue(false);
		api.checkForUpdate.mockResolvedValue(offer("install"));
		getUpdateCapability.mockResolvedValue(releaseSigned);
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(async () => {
		testing.cleanup();
		vi.restoreAllMocks();
		await switchLocale(SOURCE_LOCALE);
	});

	it("translates the token form off Android", async () => {
		platform.isAndroidPlatform.mockReturnValue(false);
		const { container, screen } = await opened();
		const token = screen.getByLabelText("Token");
		const signIn = screen.getByRole("button", { name: "Sign in" });
		const goBack = screen.getByRole("link", { name: "Go back" });
		const link = companionLink();

		await switchLocale("en-XA");

		const steps = screen.getAllByRole("listitem");
		expect(steps).toHaveLength(3);
		expectPseudo([
			slot(container, "card-title"),
			...steps,
			container.querySelector('label[for="token"]'),
			signIn,
			goBack,
		]);
		expect(textOf(steps[2])).toContain(`"${textOf(signIn)}"`);
		expect(token.getAttribute("placeholder")).toMatch(PSEUDO_MESSAGE);
		expect(textOf(link)).not.toMatch(ASCII_LETTER);
	});

	it("translates the install offer and its F-Droid notice", async () => {
		getUpdateCapability.mockResolvedValue(installedBy("org.fdroid.fdroid"));
		const { container, screen } = await opened();
		const install = screen.getByRole("button", { name: "Install" });
		const toPaste = screen.getByRole("button", {
			name: "paste the OAuth token manually",
		});
		const link = companionLink();

		await switchLocale("en-XA");

		const description = slot(container, "card-description");
		const notice = description?.querySelector("span");
		const offerText = [...(description?.childNodes ?? [])]
			.filter((node) => node !== notice)
			.map((node) => node.textContent)
			.join("");
		expect(offerText.trim()).toMatch(PSEUDO_MESSAGE);
		expectPseudo([
			slot(container, "card-title"),
			notice,
			install,
			toPaste.closest("p"),
		]);
		expect(textOf(toPaste)).not.toMatch(ASCII_LETTER);
		expect(textOf(link)).not.toMatch(ASCII_LETTER);
	});

	it("translates the install offer of a Play build", async () => {
		store.isPlayBuild.mockReturnValue(true);
		const { container } = await opened();
		const link = companionLink();

		await switchLocale("en-XA");

		expectPseudo([slot(container, "card-description")]);
		expect(textOf(link)).not.toMatch(ASCII_LETTER);
	});

	it("translates the offer to continue in the Google OAuth app", async () => {
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		const { container, screen } = await opened();
		const continueButton = screen.getByRole("button", { name: "Continue" });
		const link = companionLink();

		await switchLocale("en-XA");

		expectPseudo([slot(container, "card-description"), continueButton]);
		expect(textOf(link)).not.toMatch(ASCII_LETTER);
	});

	it("translates the way back to the Google OAuth app", async () => {
		pageMock.url.search = "?paste";
		const { screen } = await opened();
		const toCompanion = screen.getByRole("button", {
			name: "use the Open Grind Google OAuth app",
		});

		await switchLocale("en-XA");

		expectPseudo([toCompanion.closest("p")]);
		expect(textOf(toCompanion)).not.toMatch(ASCII_LETTER);
	});

	it("translates the signing-in card", async () => {
		const { googleHandoffState } =
			await import("$lib/api/google-handoff-state.svelte");
		googleHandoffState.phase = "signingIn";
		try {
			const { container } = await opened();

			await switchLocale("en-XA");

			expectPseudo([
				slot(container, "card-title"),
				slot(container, "card-description"),
			]);
		} finally {
			googleHandoffState.phase = "idle";
		}
	});

	it("explains a missing Google OAuth app in the active locale", async () => {
		api.getInstalledVersion.mockResolvedValue("1.1.0");
		callMethodMock.mockRejectedValue({
			kind: "Auth",
			message: "companion-unavailable",
		});
		const { screen } = await opened();
		const continueButton = screen.getByRole("button", { name: "Continue" });
		await switchLocale("en-XA");

		await testing.fireEvent.click(continueButton);
		await settled();

		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			expect.stringMatching(PSEUDO_MESSAGE),
		);
	});
});
