import { callMethod } from "#lib/api/methods.ts";

let signedIn: number | null = null;

export function signedInProfileIdSnapshot(): number | null {
	return signedIn;
}

export async function signedInProfileId(): Promise<number | null> {
	signedIn = (await callMethod("current_session")).profileId;
	return signedIn;
}
