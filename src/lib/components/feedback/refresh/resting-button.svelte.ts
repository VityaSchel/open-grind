import { voiceOverRunning } from "#lib/platform/voice-over.svelte.ts";

export class RestingButtonModel {
	shown = $state(false);

	#offered = $state(false);
	#sawPull = false;
	#probe: ReturnType<typeof setTimeout> | undefined;
	#probeMs: number;
	#alwaysOffered: () => boolean;

	constructor({
		probeMs,
		alwaysOffered = voiceOverRunning,
	}: {
		probeMs: number;
		alwaysOffered?: () => boolean;
	}) {
		this.#probeMs = probeMs;
		this.#alwaysOffered = alwaysOffered;
	}

	get offered(): boolean {
		return this.#offered || this.#alwaysOffered();
	}

	get alwaysOffered(): boolean {
		return this.#alwaysOffered();
	}

	get keptForAssistiveTech(): boolean {
		return this.shown && this.#alwaysOffered();
	}

	probePointer(): void {
		if (this.#sawPull || this.#offered) return;
		clearTimeout(this.#probe);
		this.#probe = setTimeout(() => {
			if (!this.#sawPull) this.#offered = true;
		}, this.#probeMs);
	}

	cancelProbe(): void {
		clearTimeout(this.#probe);
	}

	offerWithoutPull(): void {
		this.#offered = true;
	}

	withdraw(): void {
		this.cancelProbe();
		this.#offered = false;
		this.shown = false;
	}

	leaveBoundary(): void {
		this.#sawPull = true;
		this.#offered = false;
		this.shown = false;
	}

	destroy(): void {
		this.cancelProbe();
	}
}
