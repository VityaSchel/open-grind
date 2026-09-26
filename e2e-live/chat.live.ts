import { liveConversationId, recordLiveConversation } from "./support/chat";
import { counterpart } from "./support/counterpart";
import { expect, test } from "./support/fixtures";
import { uniqueLiveName } from "./support/names";
import { navigateInApp } from "./support/navigation";

test("a counterpart text arrives live and the app's reply reaches the counterpart", async ({
	app,
	ledger,
}) => {
	recordLiveConversation(ledger);
	await navigateInApp({ page: app, path: "/chat" });

	const incoming = uniqueLiveName("hello");
	await counterpart.sendText(incoming);
	const row = app
		.getByRole("link")
		.filter({ hasText: incoming })
		.and(app.locator(`[href="/chat/${liveConversationId}"]`));
	await expect(row, "the inbox shows the text without a reload").toBeVisible({
		timeout: 60_000,
	});

	await row.click();
	await expect(app.getByText(incoming)).toBeVisible();
	const reply = uniqueLiveName("reply");
	await app.getByRole("textbox").fill(reply);
	await app.getByRole("button", { name: "Send message" }).click();

	expect(await counterpart.findMessage({ text: reply })).toMatchObject({
		found: true,
	});
});
