import { liveAccounts } from "./support/accounts";
import {
	drawerMediaIds,
	liveConversationId,
	recordLiveConversation,
} from "./support/chat";
import { counterpart } from "./support/counterpart";
import { expect, test } from "./support/fixtures";
import { navigateInApp } from "./support/navigation";
import { pickNewestPhoto, pushUniquePhoto } from "./support/photo-picker";

test("a photo with unique pixels sent from the app reaches the counterpart", async ({
	app,
	ledger,
}) => {
	recordLiveConversation(ledger);
	const drawerBefore = new Set(await drawerMediaIds(app));
	const sentAfterMs = Date.now() - 120_000;
	await pushUniquePhoto();

	await navigateInApp({ page: app, path: `/chat/${liveConversationId}` });
	await app.getByRole("button", { name: "Add attachment" }).click();
	await app.getByRole("tab", { name: "Media" }).click();
	await app
		.getByRole("button", { name: "Add photo or video" })
		.first()
		.click();
	await pickNewestPhoto({ multiple: true });

	await expect
		.poll(
			async () => {
				const added = (await drawerMediaIds(app)).filter(
					(id) => !drawerBefore.has(id),
				);
				for (const id of added) {
					ledger.record({
						kind: "drawer-media",
						serverId: id,
						owner: liveAccounts.app,
						label: "unique chat photo",
					});
				}
				return added.length;
			},
			{ timeout: 60_000 },
		)
		.toBeGreaterThan(0);

	await app.locator('[data-slot="media-tile"]').first().click();
	await app.getByRole("button", { name: /^Send/ }).click();

	expect(
		await counterpart.findMessage({ type: "Image", sinceMs: sentAfterMs }),
	).toMatchObject({ found: true });
});
