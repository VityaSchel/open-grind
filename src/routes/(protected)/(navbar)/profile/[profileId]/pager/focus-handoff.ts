export type PaneControl = { scope: string; slot: string; index: number };

const PANE = '[data-slot="profile-pane"]';
const SCOPE = "nav[aria-label], [data-slot], main";

function scopeOf(element: Element): string | null {
	const scope = element.parentElement?.closest(SCOPE);
	if (!scope) return null;
	if (scope.matches("nav[aria-label]"))
		return `nav:${scope.getAttribute("aria-label")}`;
	const slot = scope.getAttribute("data-slot");
	return slot === null ? scope.localName : `slot:${slot}`;
}

function tabbableInScope({
	pane,
	scope,
	slot,
}: {
	pane: Element;
	scope: string;
	slot: string;
}): HTMLElement[] {
	return [...pane.querySelectorAll<HTMLElement>("[data-slot]")].filter(
		(element) =>
			element.dataset.slot === slot &&
			element.tabIndex >= 0 &&
			scopeOf(element) === scope,
	);
}

export function locatePaneControl(element: Element): PaneControl | null {
	const pane = element.closest(PANE);
	const slot = element.getAttribute("data-slot");
	const scope = scopeOf(element);
	if (pane === null || slot === null || scope === null) return null;
	const index = tabbableInScope({ pane, scope, slot }).findIndex(
		(control) => control === element,
	);
	return index < 0 ? null : { scope, slot, index };
}

export function paneFocusTarget({
	pane,
	control,
}: {
	pane: Element;
	control: PaneControl | null;
}): HTMLElement | null {
	const counterpart =
		control && tabbableInScope({ pane, ...control })[control.index];
	return counterpart ?? pane.querySelector<HTMLElement>("main");
}
