import type { MessageKey } from "$lib/i18n";

export type Tab = "media" | "albums" | "location";

export const tabLabelKeys = {
	media: "chat.composer.attachments.tabs.media",
	albums: "chat.composer.attachments.tabs.albums",
	location: "chat.composer.attachments.tabs.location",
} as const satisfies Record<Tab, MessageKey>;

export type SelectionAction = "send" | "share" | "unshare" | "sendLocation";

export const selectionActionKeys = {
	send: "chat.composer.attachments.actions.send",
	share: "chat.composer.attachments.actions.share",
	unshare: "chat.composer.attachments.actions.unshare",
	sendLocation: "chat.composer.attachments.actions.sendLocation",
} as const satisfies Record<SelectionAction, MessageKey>;

export type TabSelection = { count: number; action: SelectionAction };

export type SelectionTab = { submitSelection: () => void };
