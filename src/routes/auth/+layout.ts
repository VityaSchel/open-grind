import { redirect } from "@sveltejs/kit";

import { signedInProfileId } from "$lib/api/current-session";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async () => {
	const profileId = await signedInProfileId().catch(() => null);
	if (profileId !== null) {
		redirect(303, "/");
	}
};
