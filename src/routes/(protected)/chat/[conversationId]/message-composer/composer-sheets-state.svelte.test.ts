import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ConversationState } from "../conversation-state.svelte";
import {
	type ComposerBinding,
	type ComposerSheet,
	ComposerSheetsState,
} from "./composer-sheets-state.svelte";

const A = "a:1";
const B = "b:2";

function composerOf(conversationId: string): ComposerBinding {
	return {
		conversationState: () => ({ conversationId }) as ConversationState,
		context: () => ({
			conversationId,
			disabled: false,
			sendMessages: () => {},
		}),
		focusTrigger: () => {},
	};
}

describe("ComposerSheetsState open sheet", () => {
	it("starts with every sheet closed", () => {
		const sheets = new ComposerSheetsState();

		expect(sheets.isOpen({ conversationId: A, sheet: "attachments" })).toBe(
			false,
		);
		expect(sheets.isOpen({ conversationId: A, sheet: "stickers" })).toBe(
			false,
		);
	});

	it("opens only the requested sheet", () => {
		const sheets = new ComposerSheetsState();

		sheets.setOpen({ conversationId: A, sheet: "stickers", open: true });

		expect(sheets.isOpen({ conversationId: A, sheet: "stickers" })).toBe(
			true,
		);
		expect(sheets.isOpen({ conversationId: A, sheet: "attachments" })).toBe(
			false,
		);
	});

	it("keeps a sheet opened in one conversation closed in another", () => {
		const sheets = new ComposerSheetsState();

		sheets.setOpen({ conversationId: A, sheet: "attachments", open: true });

		expect(sheets.isOpen({ conversationId: A, sheet: "attachments" })).toBe(
			true,
		);
		expect(sheets.isOpen({ conversationId: B, sheet: "attachments" })).toBe(
			false,
		);
	});

	it("closes the sheet when it is set closed", () => {
		const sheets = new ComposerSheetsState();
		sheets.setOpen({ conversationId: A, sheet: "attachments", open: true });

		sheets.setOpen({
			conversationId: A,
			sheet: "attachments",
			open: false,
		});

		expect(sheets.isOpen({ conversationId: A, sheet: "attachments" })).toBe(
			false,
		);
	});

	it("leaves the open sheet alone when another conversation closes it", () => {
		const sheets = new ComposerSheetsState();
		sheets.setOpen({ conversationId: A, sheet: "stickers", open: true });

		sheets.setOpen({ conversationId: B, sheet: "stickers", open: false });
		sheets.setOpen({
			conversationId: A,
			sheet: "attachments",
			open: false,
		});

		expect(sheets.isOpen({ conversationId: A, sheet: "stickers" })).toBe(
			true,
		);
	});

	it("closes whichever sheet a conversation left open", () => {
		const sheets = new ComposerSheetsState();
		sheets.setOpen({ conversationId: A, sheet: "stickers", open: true });

		sheets.close({ conversationId: B });
		expect(sheets.isOpen({ conversationId: A, sheet: "stickers" })).toBe(
			true,
		);

		sheets.close({ conversationId: A });
		expect(sheets.isOpen({ conversationId: A, sheet: "stickers" })).toBe(
			false,
		);
	});
});

describe("ComposerSheetsState open sheet of a conversation", () => {
	it("has an open sheet only in the conversation that opened one", () => {
		const sheets = new ComposerSheetsState();
		expect(sheets.hasOpenSheet({ conversationId: A })).toBe(false);

		sheets.setOpen({ conversationId: A, sheet: "stickers", open: true });

		expect(sheets.hasOpenSheet({ conversationId: A })).toBe(true);
		expect(sheets.hasOpenSheet({ conversationId: B })).toBe(false);
	});

	it("has none once that sheet closes", () => {
		const sheets = new ComposerSheetsState();
		sheets.setOpen({ conversationId: A, sheet: "attachments", open: true });
		expect(sheets.hasOpenSheet({ conversationId: A })).toBe(true);

		sheets.setOpen({
			conversationId: A,
			sheet: "attachments",
			open: false,
		});

		expect(sheets.hasOpenSheet({ conversationId: A })).toBe(false);
	});
});

describe("ComposerSheetsState focus after a sheet closes", () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	function focusedOpener(): HTMLButtonElement {
		const opener = document.body.appendChild(
			document.createElement("button"),
		);
		opener.focus();
		return opener;
	}

	function closeAutoFocusEvent(): Event {
		return new CustomEvent("focusScope.onCloseAutoFocus", {
			cancelable: true,
		});
	}

	function openAndClose({
		sheets,
		sheet,
		whileOpen = () => {},
	}: {
		sheets: ComposerSheetsState;
		sheet: ComposerSheet;
		whileOpen?: () => void;
	}): Event {
		sheets.setOpen({ conversationId: A, sheet, open: true });
		whileOpen();
		sheets.setOpen({ conversationId: A, sheet, open: false });
		const event = closeAutoFocusEvent();
		sheets.returnFocusOnClose({ sheet, event });
		return event;
	}

	it("moves focus to the bound composer's trigger when what had focus at open is gone", () => {
		const sheets = new ComposerSheetsState();
		const focusTrigger = vi.fn();
		sheets.bind({ ...composerOf(A), focusTrigger });
		const opener = focusedOpener();

		const event = openAndClose({
			sheets,
			sheet: "stickers",
			whileOpen: () => opener.remove(),
		});

		expect(event.defaultPrevented).toBe(true);
		expect(focusTrigger).toHaveBeenCalledExactlyOnceWith({
			sheet: "stickers",
		});
	});

	it("leaves focus to the dialog when what had focus at open is still there", () => {
		const sheets = new ComposerSheetsState();
		const focusTrigger = vi.fn();
		sheets.bind({ ...composerOf(A), focusTrigger });
		const opener = focusedOpener();

		const event = openAndClose({ sheets, sheet: "attachments" });

		expect(opener.isConnected).toBe(true);
		expect(event.defaultPrevented).toBe(false);
		expect(focusTrigger).not.toHaveBeenCalled();
	});

	it("focuses the composer that took over, not the one that opened the sheet", () => {
		const sheets = new ComposerSheetsState();
		const openerFocus = vi.fn();
		const takeoverFocus = vi.fn();
		const unbindOpener = sheets.bind({
			...composerOf(A),
			focusTrigger: openerFocus,
		});
		const opener = focusedOpener();

		openAndClose({
			sheets,
			sheet: "attachments",
			whileOpen: () => {
				sheets.bind({ ...composerOf(A), focusTrigger: takeoverFocus });
				unbindOpener();
				opener.remove();
			},
		});

		expect(takeoverFocus).toHaveBeenCalledExactlyOnceWith({
			sheet: "attachments",
		});
		expect(openerFocus).not.toHaveBeenCalled();
	});
});

describe("ComposerSheetsState composer binding", () => {
	it("has no composer until one binds", () => {
		const sheets = new ComposerSheetsState();
		const composer = composerOf(A);

		expect(sheets.composer).toBeNull();
		sheets.bind(composer);
		expect(sheets.composer).toBe(composer);
	});

	it("drops the composer once it unbinds", () => {
		const sheets = new ComposerSheetsState();
		const composer = composerOf(A);
		const unbind = sheets.bind(composer);
		expect(sheets.composer).toBe(composer);

		unbind();

		expect(sheets.composer).toBeNull();
	});

	it("keeps the newer composer bound when the older one unbinds after it", () => {
		const sheets = new ComposerSheetsState();
		const older = composerOf(A);
		const newer = composerOf(A);
		const unbindOlder = sheets.bind(older);
		const unbindNewer = sheets.bind(newer);

		unbindOlder();
		expect(sheets.composer).toBe(newer);

		unbindNewer();
		expect(sheets.composer).toBeNull();
	});

	it("keeps the newer composer bound when the older one unbinds in a teardown of the same flush", () => {
		const sheets = new ComposerSheetsState();
		const older = composerOf(A);
		const newer = composerOf(A);
		const destroyOlder = $effect.root(() => {
			onDestroyOfEffectRoot(sheets.bind(older));
		});
		flushSync();
		expect(sheets.composer).toBe(older);

		const destroyNewer = $effect.root(() => {
			onDestroyOfEffectRoot(sheets.bind(newer));
		});
		destroyOlder();
		flushSync();
		expect(sheets.composer).toBe(newer);

		destroyNewer();
		flushSync();
		expect(sheets.composer).toBeNull();
	});
});

function onDestroyOfEffectRoot(teardown: () => void) {
	$effect(() => teardown);
}
