import { loadDisguisePreviews } from "#lib/platform/disguise.svelte.ts";
import type { PageLoad } from "./$types";

export const load: PageLoad = async () => ({
	previews: await loadDisguisePreviews(),
});
