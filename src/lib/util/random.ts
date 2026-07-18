export function hashString(value: string): number {
	let h = 2166136261 >>> 0;
	for (let i = 0; i < value.length; i++) {
		h = Math.imul(h ^ value.charCodeAt(i), 16777619) >>> 0;
	}
	return h >>> 0;
}

export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export type Rng = () => number;

export function pick<T>(rng: Rng, items: readonly T[]): T {
	return items[Math.floor(rng() * items.length)];
}

export function chance(rng: Rng, probability: number): boolean {
	return rng() < probability;
}

export function subset<T>(rng: Rng, items: readonly T[], max: number): T[] {
	const out: T[] = [];
	for (const item of items) {
		if (out.length >= max) break;
		if (chance(rng, 0.4)) out.push(item);
	}
	return out;
}
