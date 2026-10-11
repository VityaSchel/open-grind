import {
	liveConversationId,
	recordLiveConversation,
	uploadUniquePhotoToDrawer,
} from "./support/chat";
import { counterpart } from "./support/counterpart";
import { expect, test } from "./support/fixtures";
import { navigateInApp } from "./support/navigation";

test("a photo with unique pixels sent from the app reaches the counterpart", async ({
	app,
	ledger,
}) => {
	recordLiveConversation(ledger);
	const sentAfterMs = Date.now() - 120_000;

	await navigateInApp({ page: app, path: `/chat/${liveConversationId}` });
	await uploadUniquePhotoToDrawer({
		page: app,
		ledger,
		label: "unique chat photo",
	});

	await app.locator('[data-slot="media-tile"]').first().click();
	await app.getByRole("button", { name: /^Send/ }).click();

	expect(
		await counterpart.findMessage({ type: "Image", sinceMs: sentAfterMs }),
	).toMatchObject({ found: true });
});
