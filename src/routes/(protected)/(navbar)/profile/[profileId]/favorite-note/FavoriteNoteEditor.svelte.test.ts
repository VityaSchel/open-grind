// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	putFavoriteNoteMock,
	deleteFavoriteNoteMock,
	showErrorToastMock,
	toastSuccessMock,
} = vi.hoisted(() => ({
	putFavoriteNoteMock: vi.fn(),
	deleteFavoriteNoteMock: vi.fn(),
	showErrorToastMock: vi.fn(),
	toastSuccessMock: vi.fn(),
}));

vi.mock("#lib/api/users/favorites.ts", () => ({
	putFavoriteNote: putFavoriteNoteMock,
	deleteFavoriteNote: deleteFavoriteNoteMock,
}));
vi.mock("#lib/api/error-toast.ts", () => ({
	showErrorToast: showErrorToastMock,
}));
vi.mock("svelte-sonner", () => ({ toast: { success: toastSuccessMock } }));

import { PSEUDO_MESSAGE } from "#lib/i18n/fixtures/pseudo-message.ts";
import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import { runBackGestureHandlers } from "#lib/platform/back-gesture-event.svelte.ts";
import FavoriteNoteEditor from "./FavoriteNoteEditor.svelte";

const PROFILE_ID = 7;
const DESCRIPTION = "A private note about this profile. Only you can see it.";
const EDITED_NOTE = "met at the gym";

const saves = [
	{
		change: "an edited note",
		notes: EDITED_NOTE,
		request: putFavoriteNoteMock,
		requestArgs: {
			profileId: PROFILE_ID,
			note: { notes: EDITED_NOTE, phoneNumber: "" },
		},
		toast: "Note saved",
	},
	{
		change: "an emptied note",
		notes: "",
		request: deleteFavoriteNoteMock,
		requestArgs: { profileId: PROFILE_ID },
		toast: "Note deleted",
	},
];

function renderEditor() {
	const onSave = vi.fn();
	const stored = $state({ open: true });
	render(FavoriteNoteEditor, {
		props: {
			profileId: PROFILE_ID,
			note: { notes: "old note", phoneNumber: "" },
			onSave,
			get open() {
				return stored.open;
			},
			set open(next: boolean) {
				stored.open = next;
			},
		},
	});
	return { onSave, stored };
}

const discardPrompt = () =>
	screen.queryByRole("alertdialog", { name: "Discard changes?" });

function saveButton(): HTMLButtonElement {
	const button = screen.getByRole("dialog").querySelector("fieldset button");
	if (!(button instanceof HTMLButtonElement))
		throw new Error("no Save button");
	return button;
}

function notesField(): HTMLTextAreaElement {
	const field = screen.getByRole("dialog").querySelector("textarea");
	if (field === null) throw new Error("no note field");
	return field;
}

async function save({ notes }: { notes: string }) {
	await fireEvent.input(notesField(), { target: { value: notes } });
	await fireEvent.click(saveButton());
}

async function saveAndWait({ notes }: { notes: string }) {
	await save({ notes });
	await vi.waitFor(() => {
		expect(toastSuccessMock).toHaveBeenCalledOnce();
	});
}

async function failSave({
	notes,
	request,
}: {
	notes: string;
	request: typeof putFavoriteNoteMock;
}): Promise<Error> {
	const failure = new Error("offline");
	request.mockRejectedValueOnce(failure);
	await save({ notes });
	await vi.waitFor(() => {
		expect(showErrorToastMock).toHaveBeenCalledOnce();
	});
	return failure;
}

function phoneField(): HTMLElement {
	return screen.getByLabelText("Phone number", { selector: "input" });
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "error").mockImplementation(() => {});
	putFavoriteNoteMock.mockResolvedValue(undefined);
	deleteFavoriteNoteMock.mockResolvedValue(undefined);
});

afterEach(async () => {
	cleanup();
	vi.restoreAllMocks();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("FavoriteNoteEditor", () => {
	it("titles the dialog Note and describes it to screen readers only", () => {
		renderEditor();

		const dialog = screen.getByRole("dialog", {
			name: "Note",
			description: DESCRIPTION,
		});
		expect(screen.getByText(DESCRIPTION).classList).toContain("sr-only");
		expect(dialog.contains(screen.getByText(DESCRIPTION))).toBe(true);
	});

	it("hints what each field takes and offers Save", () => {
		renderEditor();

		expect(notesField().getAttribute("placeholder")).toBe(
			"Note for this profile…",
		);
		expect(phoneField().getAttribute("placeholder")).toBe("Optional");
		expect(saveButton().textContent.trim()).toBe("Save");
	});

	it.each(saves)(
		"toasts $toast once $change is saved",
		async ({ notes, request, requestArgs, toast }) => {
			const { onSave } = renderEditor();

			await saveAndWait({ notes });

			expect(request).toHaveBeenCalledExactlyOnceWith(requestArgs);
			expect(onSave).toHaveBeenCalledExactlyOnceWith({
				notes,
				phoneNumber: "",
			});
			expect(toastSuccessMock).toHaveBeenCalledExactlyOnceWith(toast);
		},
	);

	it.each(saves)(
		"toasts Couldn’t save note when saving $change fails",
		async ({ notes, request }) => {
			const { onSave } = renderEditor();

			const failure = await failSave({ notes, request });

			expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
				label: "Couldn’t save note",
				error: failure,
			});
			expect(onSave).not.toHaveBeenCalled();
			expect(toastSuccessMock).not.toHaveBeenCalled();
		},
	);

	it("words the dialog and its fields in the active locale", async () => {
		renderEditor();

		await setLocale({ locale: "en-XA" });

		const dialog = screen.getByRole("dialog", {
			name: PSEUDO_MESSAGE,
			description: PSEUDO_MESSAGE,
		});
		const phone = dialog.querySelector("input");
		const texts = [
			notesField().getAttribute("placeholder"),
			phone?.labels?.[0]?.textContent,
			phone?.getAttribute("placeholder"),
			saveButton().textContent.trim(),
		];
		for (const text of texts) expect(text).toMatch(PSEUDO_MESSAGE);
	});

	it.each(saves)(
		"words the $toast toast in the active locale",
		async ({ notes }) => {
			renderEditor();

			await setLocale({ locale: "en-XA" });
			await saveAndWait({ notes });

			expect(toastSuccessMock.mock.lastCall?.[0]).toMatch(PSEUDO_MESSAGE);
		},
	);

	it("words the save failure in the active locale", async () => {
		renderEditor();

		await setLocale({ locale: "en-XA" });
		await failSave({ notes: "", request: deleteFavoriteNoteMock });

		expect(showErrorToastMock.mock.lastCall?.[0].label).toMatch(
			PSEUDO_MESSAGE,
		);
	});
});

describe("closing the note editor", () => {
	it("closes at once without asking when nothing changed", () => {
		const { stored } = renderEditor();

		runBackGestureHandlers();
		flushSync();

		expect(stored.open).toBe(false);
		expect(discardPrompt()).toBeNull();
	});

	it("asks before dropping an edited note and keeps it on Keep editing", async () => {
		const { stored } = renderEditor();
		await fireEvent.input(notesField(), { target: { value: EDITED_NOTE } });

		runBackGestureHandlers();

		expect(
			await screen.findByRole("alertdialog", {
				name: "Discard changes?",
			}),
		).toBeTruthy();
		expect(stored.open).toBe(true);
		await fireEvent.click(
			screen.getByRole("button", { name: "Keep editing" }),
		);
		await vi.waitFor(() => expect(discardPrompt()).toBeNull());
		expect(stored.open).toBe(true);
		expect(notesField().value).toBe(EDITED_NOTE);
	});

	it("asks on Escape as well", async () => {
		const { stored } = renderEditor();
		await fireEvent.input(phoneField(), { target: { value: "555" } });

		await fireEvent.keyDown(phoneField(), { key: "Escape" });

		expect(
			await screen.findByRole("alertdialog", {
				name: "Discard changes?",
			}),
		).toBeTruthy();
		expect(stored.open).toBe(true);
	});

	it("drops the edit and closes without saving on Discard", async () => {
		const { stored } = renderEditor();
		await fireEvent.input(notesField(), { target: { value: EDITED_NOTE } });
		runBackGestureHandlers();

		await fireEvent.click(
			await screen.findByRole("button", { name: "Discard" }),
		);

		expect(stored.open).toBe(false);
		expect(putFavoriteNoteMock).not.toHaveBeenCalled();
	});

	it("stays open without asking while a save runs", async () => {
		putFavoriteNoteMock.mockReturnValueOnce(new Promise(() => {}));
		const { stored } = renderEditor();
		await save({ notes: EDITED_NOTE });

		runBackGestureHandlers();
		flushSync();

		expect(stored.open).toBe(true);
		expect(discardPrompt()).toBeNull();
	});
});
