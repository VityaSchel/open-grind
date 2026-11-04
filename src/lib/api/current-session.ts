import { callMethod } from "#lib/api/methods.ts";

export async function signedInProfileId(): Promise<number | null> {
	return (await callMethod("current_session")).profileId;
}
