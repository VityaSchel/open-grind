import { SvelteSet } from "svelte/reactivity";

import { registerAccountCache } from "$lib/api/account-caches";

export const viewedVideos = new SvelteSet<number>();

registerAccountCache({ reset: () => viewedVideos.clear() });
