import { afterNavigate, beforeNavigate } from "$app/navigation";

import type { RovingKey } from "#lib/util/roving-focus-state.svelte.ts";

export type KeyboardOpener = { key: RovingKey; index: number };

type ActivationWatch = {
	container: HTMLElement;
	signal: AbortSignal;
	openerAt: (target: EventTarget | null) => KeyboardOpener | null;
};

type Activation = KeyboardOpener & { href: string };
type ReturnRequest = {
	keys: readonly RovingKey[];
	redirect?: (opener: RovingKey) => RovingKey;
};

const leftOpeners = new Map<string, Activation & { returned: boolean }>();

function markReturnedOpeners(): void {
	for (const opener of leftOpeners.values())
		opener.returned = opener.href === location.href;
}

function takeReturnedOpener(scope: string): KeyboardOpener | null {
	const opener = leftOpeners.get(scope);
	leftOpeners.delete(scope);
	if (opener === undefined || !opener.returned) return null;
	return { key: opener.key, index: opener.index };
}

export class KeyboardOpenerScope {
	returning: KeyboardOpener | null;
	readonly #scope: string;
	#activated: Activation | null = null;

	constructor(scope: string) {
		this.#scope = scope;
		this.returning = takeReturnedOpener(scope);
		beforeNavigate(() => {
			this.returning = null;
		});
		afterNavigate(() => {
			this.#activated = null;
		});
	}

	returnKey({ keys, redirect }: ReturnRequest): RovingKey | null {
		const returning = this.returning;
		if (returning === null || keys.length === 0) return null;
		const wanted = redirect?.(returning.key) ?? returning.key;
		if (keys.includes(wanted)) return wanted;
		return keys[Math.min(Math.max(returning.index, 0), keys.length - 1)]!;
	}

	watch({ container, signal, openerAt }: ActivationWatch): void {
		const listening = { signal };
		container.addEventListener(
			"click",
			({ target, detail }) => {
				const opener = openerAt(target);
				if (opener === null) return;
				this.#activated =
					detail === 0 ? { ...opener, href: location.href } : null;
			},
			listening,
		);
		document.addEventListener(
			"focusin",
			({ target }) => {
				const movedAway =
					target instanceof Node &&
					target !== document.body &&
					!container.contains(target);
				if (movedAway) this.#activated = null;
			},
			listening,
		);
		signal.addEventListener("abort", () => {
			if (this.#activated !== null) {
				leftOpeners.set(this.#scope, {
					...this.#activated,
					returned: false,
				});
				addEventListener("popstate", markReturnedOpeners);
			}
			this.#activated = null;
		});
	}
}
