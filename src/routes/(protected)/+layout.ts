import { redirect } from "@sveltejs/kit";

import { callMethod } from "$lib/api/methods";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async () => {
	const profileId = await callMethod("auth_state");
	if (profileId === null) {
		redirect(303, "/auth/sign-in");
	}
	return { ourProfileId: profileId };
};
