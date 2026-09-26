import { assertSignedInAsApp } from "./accounts";
import { signedInProfileId, watchRateLimits } from "./app";
import { attachApp, type AttachedApp } from "./device";

export async function attachSignedInApp(): Promise<AttachedApp> {
	const attached = await attachApp();
	await watchRateLimits(attached.page);
	assertSignedInAsApp(await signedInProfileId(attached.page));
	return attached;
}
