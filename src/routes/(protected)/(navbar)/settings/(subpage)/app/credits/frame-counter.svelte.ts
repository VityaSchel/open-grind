export class FrameCounter {
	count = $state(0);

	constructor({ total }: { total: () => number }) {
		this.count = Math.min(total(), 1);
		$effect(() => {
			if (this.count >= total()) return;
			const frame = requestAnimationFrame(() => {
				this.count += 1;
			});
			return () => cancelAnimationFrame(frame);
		});
	}
}
