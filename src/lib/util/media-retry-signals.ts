import { mediaRetry } from "$lib/util/media-retry.svelte";
import { reconciler } from "$lib/util/reconcile";

export function retryBrokenMediaWhenOnline(): () => void {
	const nudge = () => mediaRetry.nudge();
	const nudgeWhenShown = () => {
		if (document.visibilityState === "visible") nudge();
	};
	const unsubscribe = reconciler.subscribe(nudge);
	window.addEventListener("online", nudge);
	document.addEventListener("visibilitychange", nudgeWhenShown);
	return () => {
		unsubscribe();
		window.removeEventListener("online", nudge);
		document.removeEventListener("visibilitychange", nudgeWhenShown);
	};
}
