import { mediaRetry } from "$lib/util/media-retry.svelte";
import { reconciler } from "$lib/util/reconcile";

export function retryBrokenMediaWhenOnline(): () => void {
	const nudge = () => mediaRetry.nudge();
	const unsubscribe = reconciler.subscribe(nudge);
	window.addEventListener("online", nudge);
	return () => {
		unsubscribe();
		window.removeEventListener("online", nudge);
	};
}
