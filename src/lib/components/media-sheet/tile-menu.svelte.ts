import { returnFocus } from "$lib/util/return-focus";

export class TileMenuState<Item> {
	current = $state<{
		key: string | number;
		item: Item;
		tile: HTMLButtonElement;
	} | null>(null);

	open({
		key,
		item,
		tile,
	}: {
		key: string | number;
		item: Item;
		tile: HTMLButtonElement;
	}): void {
		if (this.current === null) this.current = { key, item, tile };
	}

	isLifted(key: string | number): boolean {
		return this.current?.key === key;
	}

	close(): void {
		const tile = this.current?.tile;
		this.current = null;
		if (tile !== undefined) returnFocus(tile);
	}
}
