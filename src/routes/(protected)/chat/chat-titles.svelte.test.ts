// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { currentPage } = vi.hoisted(() => ({ currentPage: { params: {} } }));

vi.mock("$app/state", () => ({ page: currentPage }));
vi.mock("#lib/util/breakpoints.svelte.ts", () => ({
	below: () => ({ current: true }),
}));
vi.mock("#lib/chat/conversations-context.svelte.ts", () => ({
	getOrCreateConversationsState: () => ({ setFilters: () => {} }),
	setConversations: () => {},
}));
vi.mock("#lib/components/shared/NavBar.svelte", () => ({ default: () => {} }));
vi.mock("./live-stack/LiveStack.svelte", () => ({ default: () => {} }));
vi.mock("./ConversationsList.svelte", () => ({ default: () => {} }));
vi.mock("./[conversationId]/ConversationScreen.svelte", () => ({
	default: () => {},
}));
vi.mock(
	"./[conversationId]/message-composer/composer-sheets-state.svelte",
	() => ({ ComposerSheetsState: class {}, setComposerSheets: () => {} }),
);
vi.mock("./[conversationId]/message-composer/ComposerSheets.svelte", () => ({
	default: () => {},
}));
vi.mock(
	"./[conversationId]/message-composer/send-media/send-media-offer.svelte",
	() => ({ provideSendMediaOffer: () => ({ keepFor: () => {} }) }),
);
vi.mock(
	"./[conversationId]/message-composer/send-media/SendMediaDialog.svelte",
	() => ({ default: () => {} }),
);

import { PSEUDO_TITLE } from "#lib/i18n/fixtures/pseudo-message.ts";
import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import ChatLayout from "./+layout@(protected).svelte";

function openChat(params: { conversationId?: string }) {
	currentPage.params = params;
	render(ChatLayout, {
		props: {
			data: { ourProfileId: 1 },
			params,
			children: createRawSnippet(() => ({ render: () => "<div></div>" })),
		},
	});
}

afterEach(async () => {
	cleanup();
	document.title = "";
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("chat layout", () => {
	it("titles the inbox, replacing the previous title, in the active locale", async () => {
		document.title = "Edit Album — Open Grind";

		openChat({});

		expect(document.title).toBe("Inbox — Open Grind");

		await setLocale({ locale: "en-XA" });

		await vi.waitFor(() => expect(document.title).toMatch(PSEUDO_TITLE));
	});

	it("leaves an open conversation's title to its screen", () => {
		document.title = "Alex — Open Grind";

		openChat({ conversationId: "1:2" });

		expect(document.title).toBe("Alex — Open Grind");
	});
});
