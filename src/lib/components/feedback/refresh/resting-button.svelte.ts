export class RestingButtonModel {
	shown = $state(false);

	#pointerOnly = $state(false);
	#sawBand = false;
	#probe: ReturnType<typeof setTimeout> | undefined;
	#probeMs: number;

	constructor({ probeMs }: { probeMs: number }) {
		this.#probeMs = probeMs;
	}

	get pointerOnly(): boolean {
		return this.#pointerOnly;
	}

	probePointer(): void {
		if (this.#sawBand || this.#pointerOnly) return;
		clearTimeout(this.#probe);
		this.#probe = setTimeout(() => {
			if (!this.#sawBand) this.#pointerOnly = true;
		}, this.#probeMs);
	}

	leaveBoundary(): void {
		this.#sawBand = true;
		this.#pointerOnly = false;
		this.shown = false;
	}

	destroy(): void {
		clearTimeout(this.#probe);
	}
}
