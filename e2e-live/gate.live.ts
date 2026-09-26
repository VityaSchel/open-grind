import { liveAccounts } from "./support/accounts";
import { buildCounterpart, counterpart } from "./support/counterpart";
import { expect, test } from "./support/fixtures";

test("the app is signed in as the burner and the counterpart answers", async ({
	attached,
}) => {
	test.setTimeout(900_000);
	expect(new URL(attached.page.url()).pathname).not.toMatch(/^\/auth\//);
	buildCounterpart();
	expect((await counterpart.probe()).profileId).toBe(
		String(liveAccounts.counterpart),
	);
});
