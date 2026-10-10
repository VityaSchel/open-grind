// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { unblockUserMock, showErrorToastMock } = vi.hoisted(() => ({
	unblockUserMock: vi.fn(),
	showErrorToastMock: vi.fn(),
}));

vi.mock("$lib/api/browse/blocks", () => ({ unblockUser: unblockUserMock }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { slot } from "$lib/i18n/fixtures/dom";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import BlockedProfile from "./BlockedProfile.svelte";

const PROFILE_ID = 7;
const BUG_REPORT_URL =
	"https://git.opengrind.org/open-grind/open-grind/issues/new?template=.forgejo%2fissue_template%2fbug.yaml";

const variants = [
	{ blockedByUs: true, title: "You Have Blocked This Profile." },
	{ blockedByUs: false, title: "This Person Has Blocked You." },
];

function renderBlocked({ blockedByUs }: { blockedByUs: boolean }) {
	const pending = { revert: vi.fn(), settle: vi.fn() };
	render(BlockedProfile, {
		props: {
			profileId: PROFILE_ID,
			blockedByUs,
			changingViewability: false,
			markViewable: () => pending,
		},
	});
	return pending;
}

function descriptionLinks() {
	const description = slot("empty-description");
	const links = [...description.children].filter(
		(child) => child instanceof HTMLAnchorElement,
	);
	return { description, links };
}

function bugReportLink() {
	const { description, links } = descriptionLinks();
	expect(links).toHaveLength(1);
	const [link] = links;
	if (link === undefined) throw new Error("no bug report link");
	return { description, link };
}

async function failUnblock(): Promise<Error> {
	const failure = new Error("offline");
	unblockUserMock.mockRejectedValueOnce(failure);
	await fireEvent.click(screen.getByRole("button"));
	await vi.waitFor(() => {
		expect(showErrorToastMock).toHaveBeenCalledOnce();
	});
	return failure;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
	cleanup();
	vi.restoreAllMocks();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("BlockedProfile", () => {
	it.each(variants)("titles the screen $title", ({ blockedByUs, title }) => {
		renderBlocked({ blockedByUs });

		expect(slot("empty-title").textContent).toBe(title);
	});

	it("offers Unblock without a bug report link when we blocked them", () => {
		renderBlocked({ blockedByUs: true });

		expect(screen.getByRole("button").textContent).toBe("Unblock");
		expect(descriptionLinks().links).toEqual([]);
	});

	it("points to the bug report form when they blocked us", () => {
		renderBlocked({ blockedByUs: false });

		const { description, link } = bugReportLink();
		expect(description.textContent).toBe(
			"If you know this is a bug in the app, report an issue.",
		);
		expect(screen.getByRole("link", { name: "report an issue" })).toBe(
			link,
		);
		expect(link.getAttribute("href")).toBe(BUG_REPORT_URL);
		expect(link.getAttribute("target")).toBe("_blank");
		expect(screen.queryByRole("button")).toBeNull();
	});

	it("toasts Failed to unblock user and reverts when unblocking fails", async () => {
		const pending = renderBlocked({ blockedByUs: true });

		const failure = await failUnblock();

		expect(unblockUserMock).toHaveBeenCalledExactlyOnceWith({
			profileId: PROFILE_ID,
		});
		expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
			label: "Failed to unblock user",
			error: failure,
		});
		expect(pending.revert).toHaveBeenCalledOnce();
		expect(pending.settle).not.toHaveBeenCalled();
	});

	it("words the screen we blocked and its failure in the active locale", async () => {
		renderBlocked({ blockedByUs: true });

		await setLocale({ locale: "en-XA" });
		await failUnblock();

		expect(slot("empty-title").textContent).toMatch(PSEUDO_MESSAGE);
		expect(screen.getByRole("button").textContent).toMatch(PSEUDO_MESSAGE);
		expect(showErrorToastMock.mock.lastCall?.[0].label).toMatch(
			PSEUDO_MESSAGE,
		);
	});

	it("words the bug report hint in the active locale and keeps its link", async () => {
		renderBlocked({ blockedByUs: false });

		await setLocale({ locale: "en-XA" });

		const { description, link } = bugReportLink();
		expect(slot("empty-title").textContent).toMatch(PSEUDO_MESSAGE);
		expect(description.textContent).toMatch(PSEUDO_MESSAGE);
		expect(link.textContent).not.toBe("report an issue");
		expect(description.textContent).toContain(`, ${link.textContent}.`);
		expect(description.textContent).not.toContain("report an issue");
		expect(link.getAttribute("href")).toBe(BUG_REPORT_URL);
	});
});
