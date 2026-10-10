// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "svelte";

const { blockUserMock, reportProfileMock, showErrorToastMock } = vi.hoisted(
	() => ({
		blockUserMock: vi.fn(),
		reportProfileMock: vi.fn(),
		showErrorToastMock: vi.fn(),
	}),
);

vi.mock("$lib/api/browse/blocks", () => ({ blockUser: blockUserMock }));
vi.mock("$lib/api/safety/reports", () => ({
	reportProfile: reportProfileMock,
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { slot } from "$lib/i18n/fixtures/dom";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import {
	type ReportLocation,
	reportLocationSchema,
	type ReportReason,
	reportReasonSchema,
} from "$lib/model/safety/reports";
import ReportSheet from "./ReportSheet.svelte";

type SheetProps = Pick<
	ComponentProps<typeof ReportSheet>,
	"subject" | "locations" | "blockable"
>;

const PROFILE_ID = 7;
const DETAILS = "Details (optional)";
const WHERE = "Where it happened";
const BLOCK_HINT = "You can block this profile so you stop seeing it.";

const reasonLabels: Record<ReportReason, string> = {
	SPAM: "Spam",
	HARASSMENT_BULLYING: "Harassment or Bullying",
	HATE_DISCRIMINATION: "Hate Speech/Discrimination",
	NUDITY_PORNOGRAPHY: "Nudity or Pornography",
	UNDERAGE: "Underage",
	IMPERSONATION: "Impersonation",
	ILLEGAL_ACTIVITY: "Illegal Activity",
	SEXUAL_SOLICITATION: "Sexual Solicitation",
	SERIOUS_IN_PERSON_INCIDENT: "Serious in Person Incident",
};

const locationLabels: Record<ReportLocation, string> = {
	PROFILE_PHOTO: "Profile Photo",
	PROFILE_INFORMATION: "Profile Information",
	CHAT_MESSAGE: "Chat Message",
	ALBUM: "Album",
	RIGHT_NOW_PHOTO: "Right Now Image",
	RIGHT_NOW_TEXT: "Right Now Text",
};

const subjects = [
	{
		props: { subject: "profile" },
		title: "Report Profile",
		description: "Send a report about this profile to Grindr.",
		reviewed: "Grindr will review this profile.",
	},
	{
		props: { subject: "message", locations: ["CHAT_MESSAGE"] },
		title: "Report Message",
		description: "Send a report about this person’s messages to Grindr.",
		reviewed: "Grindr will review your report.",
	},
] satisfies {
	props: SheetProps;
	title: string;
	description: string;
	reviewed: string;
}[];

function renderSheet(props: SheetProps = {}) {
	const onBlocked = vi.fn();
	render(ReportSheet, {
		props: { open: true, profileId: PROFILE_ID, onBlocked, ...props },
	});
	return onBlocked;
}

const reasonToggles = () =>
	within(slot("report-reasons")).getAllByRole("radio");
const locationToggles = () =>
	within(slot("report-locations")).getAllByRole("button");
const footerButtons = () =>
	within(slot("drawer-footer")).queryAllByRole("button");
const submitButton = () => within(slot("drawer-footer")).getByRole("button");
const toggleGroupLabel = (slotName: string) =>
	slot(slotName).querySelector('[role="group"]')?.getAttribute("aria-label");
const texts = (elements: HTMLElement[]) =>
	elements.map((element) => element.textContent.trim());

function reasonToggle(reason: ReportReason): HTMLElement {
	const toggle = reasonToggles()[reportReasonSchema.options.indexOf(reason)];
	if (toggle === undefined) throw new Error(`no ${reason} toggle`);
	return toggle;
}

function heading(): HTMLElement {
	return within(screen.getByRole("dialog")).getByRole("heading");
}

async function submit(reason: ReportReason) {
	await fireEvent.click(reasonToggle(reason));
	await fireEvent.click(submitButton());
}

async function submitAndWait(reason: ReportReason) {
	await submit(reason);
	await vi.waitFor(() => {
		expect(
			document.querySelector('[data-slot="report-submitted"]'),
		).not.toBe(null);
	});
}

async function failSubmit(): Promise<Error> {
	const failure = new Error("offline");
	reportProfileMock.mockRejectedValueOnce(failure);
	await submit("SPAM");
	await vi.waitFor(() => {
		expect(showErrorToastMock).toHaveBeenCalledOnce();
	});
	return failure;
}

async function failBlock(): Promise<Error> {
	await submitAndWait("SPAM");
	const failure = new Error("offline");
	blockUserMock.mockRejectedValueOnce(failure);
	const [block] = footerButtons();
	if (block === undefined) throw new Error("no Block Profile button");
	await fireEvent.click(block);
	await vi.waitFor(() => {
		expect(showErrorToastMock).toHaveBeenCalledOnce();
	});
	return failure;
}

const failures = [
	{ action: "sending", fail: failSubmit, label: "Failed to send report" },
	{ action: "blocking", fail: failBlock, label: "Failed to block user" },
];

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "error").mockImplementation(() => {});
	reportProfileMock.mockResolvedValue(undefined);
	blockUserMock.mockResolvedValue(undefined);
});

afterEach(async () => {
	cleanup();
	vi.restoreAllMocks();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("ReportSheet", () => {
	it("offers every reason by its label, in the wire order", () => {
		renderSheet();

		const group = screen.getByRole("group", { name: "Reason" });
		expect(texts(within(group).getAllByRole("radio"))).toEqual(
			reportReasonSchema.options.map((reason) => reasonLabels[reason]),
		);
		expect(submitButton().textContent.trim()).toBe("Submit Report");
		expect(submitButton()).toHaveProperty("disabled", true);
	});

	it("asks where it happened and for details once a reason is chosen", async () => {
		renderSheet();

		await fireEvent.click(reasonToggle("IMPERSONATION"));

		const group = screen.getByRole("group", { name: WHERE });
		expect(
			slot("report-locations").querySelector("span")?.textContent,
		).toBe(WHERE);
		expect(texts(within(group).getAllByRole("button"))).toEqual(
			reportLocationSchema.options.map(
				(location) => locationLabels[location],
			),
		);
		const details = screen.getByRole("textbox", { name: DETAILS });
		expect(details.getAttribute("placeholder")).toBe(DETAILS);
	});

	it("asks for neither the place nor details for spam", async () => {
		renderSheet();
		await fireEvent.click(reasonToggle("IMPERSONATION"));
		expect(screen.queryByRole("textbox")).not.toBe(null);

		await fireEvent.click(reasonToggle("SPAM"));

		expect(document.querySelector('[data-slot="report-locations"]')).toBe(
			null,
		);
		expect(screen.queryByRole("textbox")).toBe(null);
	});

	it("sends the wire values of the chosen reason and place", async () => {
		renderSheet();
		await fireEvent.click(reasonToggle("IMPERSONATION"));
		await fireEvent.click(
			within(slot("report-locations")).getByRole("button", {
				name: locationLabels.PROFILE_PHOTO,
			}),
		);
		await fireEvent.input(screen.getByRole("textbox"), {
			target: { value: "not who they say they are" },
		});

		await fireEvent.click(submitButton());

		expect(reportProfileMock).toHaveBeenCalledExactlyOnceWith({
			profileId: PROFILE_ID,
			report: {
				reason: "IMPERSONATION",
				comment: "not who they say they are",
				locations: ["PROFILE_PHOTO"],
			},
		});
	});

	it.each(subjects)(
		"titles and describes the $props.subject report",
		async ({ props, title, description, reviewed }) => {
			renderSheet(props);

			screen.getByRole("dialog", { name: title, description });
			expect(heading().textContent.trim()).toBe(title);

			await submitAndWait("HARASSMENT_BULLYING");

			screen.getByRole("dialog", {
				name: "Report Submitted",
				description,
			});
			expect(
				slot("report-submitted").querySelector("p")?.textContent,
			).toBe(reviewed);
		},
	);

	it("keeps the chat location of a message report without asking", async () => {
		renderSheet({ subject: "message", locations: ["CHAT_MESSAGE"] });

		await fireEvent.click(reasonToggle("HARASSMENT_BULLYING"));

		expect(document.querySelector('[data-slot="report-locations"]')).toBe(
			null,
		);
		expect(screen.getByRole("textbox", { name: DETAILS })).not.toBe(null);
	});

	it("offers to block the profile once the report is in", async () => {
		const onBlocked = renderSheet();

		await submitAndWait("SPAM");

		expect(slot("report-submitted").textContent).toContain(BLOCK_HINT);
		expect(texts(footerButtons())).toEqual(["Block Profile", "Done"]);
		await fireEvent.click(
			screen.getByRole("button", { name: "Block Profile" }),
		);
		await vi.waitFor(() => {
			expect(onBlocked).toHaveBeenCalledOnce();
		});
		expect(blockUserMock).toHaveBeenCalledExactlyOnceWith({
			profileId: PROFILE_ID,
		});
	});

	it("only says Done for a profile that cannot be blocked", async () => {
		renderSheet({ blockable: false });

		await submitAndWait("SPAM");

		expect(slot("report-submitted").textContent).not.toContain(BLOCK_HINT);
		expect(slot("report-submitted").querySelectorAll("p")).toHaveLength(1);
		expect(texts(footerButtons())).toEqual(["Done"]);
	});

	it.each(failures)(
		"toasts $label when $action fails",
		async ({ fail, label }) => {
			renderSheet();

			const failure = await fail();

			expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
				label,
				error: failure,
			});
		},
	);

	it.each(subjects)(
		"words the $props.subject report form in the active locale",
		async ({ props }) => {
			renderSheet({ subject: props.subject });
			await fireEvent.click(reasonToggle("IMPERSONATION"));

			await setLocale({ locale: "en-XA" });

			screen.getByRole("dialog", {
				name: PSEUDO_MESSAGE,
				description: PSEUDO_MESSAGE,
			});
			const details = screen.getByRole("textbox");
			const labels = [
				...texts(reasonToggles()),
				...texts(locationToggles()),
				slot("report-locations").querySelector("span")?.textContent,
				toggleGroupLabel("report-reasons"),
				toggleGroupLabel("report-locations"),
				details.getAttribute("aria-label"),
				details.getAttribute("placeholder"),
				submitButton().textContent.trim(),
			];
			expect(labels).toHaveLength(
				reportReasonSchema.options.length +
					reportLocationSchema.options.length +
					6,
			);
			for (const label of labels) expect(label).toMatch(PSEUDO_MESSAGE);
		},
	);

	it.each(subjects)(
		"words the submitted $props.subject report in the active locale",
		async ({ props }) => {
			renderSheet(props);
			await submitAndWait("SPAM");

			await setLocale({ locale: "en-XA" });

			screen.getByRole("dialog", {
				name: PSEUDO_MESSAGE,
				description: PSEUDO_MESSAGE,
			});
			const labels = [
				...texts([...slot("report-submitted").querySelectorAll("p")]),
				...texts(footerButtons()),
			];
			expect(labels).toHaveLength(4);
			for (const label of labels) expect(label).toMatch(PSEUDO_MESSAGE);
		},
	);

	it.each(failures)(
		"words the failure toast when $action fails in the active locale",
		async ({ fail }) => {
			renderSheet();

			await setLocale({ locale: "en-XA" });
			await fail();

			expect(showErrorToastMock.mock.lastCall?.[0].label).toMatch(
				PSEUDO_MESSAGE,
			);
		},
	);
});
