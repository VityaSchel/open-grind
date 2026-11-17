const holders = new Set<symbol>();

export function holdTouch(): () => void {
	const holder = Symbol("touch holder");
	holders.add(holder);
	return () => {
		holders.delete(holder);
	};
}

export function touchHeld(): boolean {
	return holders.size > 0;
}
