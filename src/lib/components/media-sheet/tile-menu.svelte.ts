import { returnFocus } from "$lib/util/return-focus";
import { readGridMetrics } from "$lib/util/virtual-grid.svelte";

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

export function isPastMiddleColumn(tile: HTMLElement): boolean {
	const grid = tile.parentElement;
	if (grid === null) return false;
	const { columns } = readGridMetrics(grid);
	const column = [...grid.children].indexOf(tile) % columns;
	return column > (columns - 1) / 2;
}
