import type { MessageKey } from "$lib/i18n";

export type Tab = "media" | "albums" | "location";

export type SelectionAction = "send" | "share" | "unshare";

export const selectionActionKeys = {
	send: "chat.composer.attachments.actions.send",
	share: "chat.composer.attachments.actions.share",
	unshare: "chat.composer.attachments.actions.unshare",
} as const satisfies Record<SelectionAction, MessageKey>;

export type TabSelection = { count: number; action: SelectionAction };

export type SelectionTab = { submitSelection: () => void };
