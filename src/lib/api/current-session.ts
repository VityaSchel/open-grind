import { callMethod } from "$lib/api/methods";

export async function signedInProfileId(): Promise<number | null> {
	return (await callMethod("current_session")).profileId;
}
