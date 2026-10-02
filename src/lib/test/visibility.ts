export function setVisibility(state: "visible" | "hidden"): void {
	Object.defineProperty(document, "visibilityState", {
		value: state,
		configurable: true,
	});
	document.dispatchEvent(new Event("visibilitychange"));
}
