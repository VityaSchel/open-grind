import { beforeNavigate, type BeforeNavigate, goto } from "$app/navigation";
import { createContext, onDestroy } from "svelte";

import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";
import { isDeleted } from "#lib/util/deleted-pages.ts";

class UnsavedChanges {
	unsaved: (() => boolean) | null = $state(null);
	confirming = $state(false);
	#resume: () => void = () => {};

	get pending(): boolean {
		return this.unsaved?.() ?? false;
	}

	ask(resume: () => void): void {
		this.#resume = resume;
		this.confirming = true;
	}

	discard(): void {
		this.unsaved = null;
		this.#resume();
	}
}

const [getUnsavedChanges, setUnsavedChangesContext] =
	createContext<UnsavedChanges>();

function guardedDestination({
	from,
	to,
	willUnload,
}: BeforeNavigate): URL | null {
	if (willUnload || !to?.route.id?.startsWith("/(protected)")) return null;
	if (isDeleted(from?.url.pathname ?? null)) return null;
	return to.url;
}

export function provideUnsavedChangesGuard({
	goBack,
}: {
	goBack: () => void;
}): UnsavedChanges {
	const changes = setUnsavedChangesContext(new UnsavedChanges());

	beforeNavigate((navigation) => {
		const destination = guardedDestination(navigation);
		if (destination === null || !changes.pending) return;
		navigation.cancel();
		changes.ask(
			navigation.type === "popstate"
				? () => history.go(navigation.delta)
				: () => void goto(destination),
		);
	});

	dismissOnBackGesture({
		active: () => changes.pending,
		dismiss: () => changes.ask(goBack),
		layer: "guard",
	});

	return changes;
}

export function guardUnsavedChanges(unsaved: () => boolean): void {
	const changes = getUnsavedChanges();
	changes.unsaved = unsaved;
	onDestroy(() => {
		if (changes.unsaved === unsaved) changes.unsaved = null;
	});
}
