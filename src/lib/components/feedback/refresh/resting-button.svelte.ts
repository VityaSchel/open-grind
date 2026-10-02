export class RestingButtonModel {
	shown = $state(false);

	#offered = $state(false);
	#sawPull = false;
	#probe: ReturnType<typeof setTimeout> | undefined;
	#probeMs: number;

	constructor({ probeMs }: { probeMs: number }) {
		this.#probeMs = probeMs;
	}

	get offered(): boolean {
		return this.#offered;
	}

	probePointer(): void {
		if (this.#sawPull || this.#offered) return;
		clearTimeout(this.#probe);
		this.#probe = setTimeout(() => {
			if (!this.#sawPull) this.#offered = true;
		}, this.#probeMs);
	}

	offerWithoutPull(): void {
		this.#offered = true;
	}

	leaveBoundary(): void {
		this.#sawPull = true;
		this.#offered = false;
		this.shown = false;
	}

	destroy(): void {
		clearTimeout(this.#probe);
	}
}
