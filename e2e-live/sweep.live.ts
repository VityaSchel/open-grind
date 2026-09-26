import { sweep } from "./support/cleanup";
import { expect, test } from "./support/fixtures";

test("the sweep removes everything earlier runs left behind", async ({
	app,
	ledger,
	liveState,
}) => {
	const { failed } = await sweep({
		page: app,
		ledger,
		stopFile: liveState.stop,
	});
	expect(
		failed.map(({ entry }) => `${entry.kind} ${entry.serverId}`),
	).toEqual([]);
	expect(ledger.pending()).toEqual([]);
});
