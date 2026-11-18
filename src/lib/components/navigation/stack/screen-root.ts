import { SvelteMap, SvelteSet } from "svelte/reactivity";
import type { Attachment } from "svelte/attachments";

import { trackScrolled } from "./snapshot";

export type GhostFixup = (ghost: HTMLElement) => void;

type ScreenRootRole = "front" | "captured";

const roots = new SvelteMap<HTMLElement, ScreenRootRole>();
const navBarRiders = new SvelteSet<HTMLElement>();
const ghostFixups = new Map<string, GhostFixup>();

function registerScreenRoot({
	root,
	role,
}: {
	root: HTMLElement;
	role: ScreenRootRole;
}): () => void {
	const stopTracking = trackScrolled(root);
	roots.set(root, role);
	return () => {
		roots.delete(root);
		stopTracking?.();
	};
}

export const screenRoot: Attachment<HTMLElement> = (root) =>
	registerScreenRoot({ root, role: "front" });

export const capturedScreenRoot: Attachment<HTMLElement> = (root) =>
	registerScreenRoot({ root, role: "captured" });

export function currentScreenRoot(): HTMLElement | null {
	return [...roots.keys()].at(-1) ?? null;
}

export function currentScreenFront(): HTMLElement | null {
	const root = currentScreenRoot();
	return root !== null && roots.get(root) === "front" ? root : null;
}

export const navBarRider: Attachment<HTMLElement> = (navBar) => {
	navBarRiders.add(navBar);
	return () => {
		navBarRiders.delete(navBar);
	};
};

export function currentNavBarRider(): HTMLElement | null {
	return [...navBarRiders].at(-1) ?? null;
}

export function registerGhostFixup({
	path,
	fixup,
}: {
	path: string;
	fixup: GhostFixup;
}): () => void {
	ghostFixups.set(path, fixup);
	return () => {
		if (ghostFixups.get(path) === fixup) ghostFixups.delete(path);
	};
}

export function ghostFixupFor(path: string): GhostFixup | undefined {
	return ghostFixups.get(path);
}

export class ScreenLanding {
	readonly #holds = new Set<symbol>();
	#released: (() => void) | undefined;

	hold(): () => void {
		const hold = Symbol("screen landing hold");
		this.#holds.add(hold);
		return () => {
			if (!this.#holds.delete(hold) || this.#holds.size > 0) return;
			this.#released?.();
		};
	}

	released(): Promise<void> {
		if (this.#holds.size === 0) return Promise.resolve();
		return new Promise((resolve) => {
			this.#released = resolve;
		});
	}
}

let landing: ScreenLanding | null = null;

export function openScreenLanding(): ScreenLanding {
	landing = new ScreenLanding();
	return landing;
}

export function closeScreenLanding(closing: ScreenLanding): void {
	if (landing === closing) landing = null;
}

export function holdScreenLanding(): () => void {
	return landing?.hold() ?? (() => {});
}
