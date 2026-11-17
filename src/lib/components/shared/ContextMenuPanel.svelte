<script lang="ts">
	import type { Snippet } from "svelte";

	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";

	let {
		label,
		leading,
		children,
	}: { label: string; leading?: Snippet; children: Snippet } = $props();

	type Registration = { item: HTMLElement; key: number; release: () => void };

	const MENU_ITEM = '[role="menuitem"]';

	let shownItems = $state.raw<number[]>([]);

	const roving = new RovingFocusState({
		keys: () => shownItems,
		orientation: "vertical",
		wrap: "loop",
		stopTabindex: "explicit",
		typeahead: (item) =>
			item.getAttribute("aria-label") ?? item.textContent ?? "",
	});

	function isShown(item: HTMLElement): boolean {
		return !("checkVisibility" in item) || item.checkVisibility();
	}

	function trackItems(menu: HTMLElement) {
		let registered: Registration[] = [];
		let nextKey = 0;
		const listShown = () => {
			shownItems = registered
				.filter(({ item }) => isShown(item))
				.map(({ key }) => key);
		};
		const showing = new ResizeObserver(listShown);
		const register = (item: HTMLElement): Registration => {
			const key = nextKey++;
			showing.observe(item);
			return { item, key, release: roving.item(key)(item) ?? (() => {}) };
		};
		const syncItems = () => {
			const present = [...menu.querySelectorAll<HTMLElement>(MENU_ITEM)];
			for (const gone of registered) {
				if (present.includes(gone.item)) continue;
				showing.unobserve(gone.item);
				gone.release();
			}
			registered = present.map(
				(item) =>
					registered.find((entry) => entry.item === item) ??
					register(item),
			);
			listShown();
		};
		const changes = new MutationObserver(syncItems);
		changes.observe(menu, { childList: true, subtree: true });
		syncItems();
		return () => {
			changes.disconnect();
			showing.disconnect();
			for (const { release } of registered) release();
		};
	}
</script>

<div
	role="menu"
	aria-label={label}
	class="flex flex-col"
	{@attach roving.container}
	{@attach trackItems}
>
	{@render leading?.()}
	<div
		data-slot="context-menu-panel"
		class="flex w-max min-w-45 flex-col rounded-xl bg-black/80 p-1 *:justify-start *:active:translate-y-0!"
	>
		{@render children()}
	</div>
</div>
