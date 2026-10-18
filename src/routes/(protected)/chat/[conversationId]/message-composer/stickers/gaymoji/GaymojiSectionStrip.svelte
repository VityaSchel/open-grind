<script lang="ts">
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import { preferredScrollBehavior } from "$lib/util/reduced-motion";
	import type { GaymojiSection } from "$lib/chat/gaymoji-sections";
	import { ElementRegistry } from "./element-registry";

	let {
		ref = $bindable(null),
		sections,
		current,
		onPick,
	}: {
		ref?: HTMLElement | null;
		sections: GaymojiSection[];
		current: string | null;
		onPick: (key: string) => void;
	} = $props();

	let row = $state<HTMLDivElement | null>(null);
	const buttons = new ElementRegistry<HTMLButtonElement>();

	function revealInRow(button: HTMLButtonElement) {
		if (!row) return;
		const inset = parseFloat(getComputedStyle(row).paddingInlineStart);
		const start = button.offsetLeft - inset;
		const end = button.offsetLeft + button.offsetWidth + inset;
		const behavior = preferredScrollBehavior();
		if (start < row.scrollLeft) row.scrollTo({ left: start, behavior });
		else if (end > row.scrollLeft + row.clientWidth)
			row.scrollTo({ left: end - row.clientWidth, behavior });
	}

	$effect(() => {
		const button = current === null ? undefined : buttons.get(current);
		if (button) revealInRow(button);
	});
</script>

<nav
	bind:this={ref}
	data-slot="gaymoji-section-strip"
	aria-label="Gaymoji categories"
	class="sticky top-0 z-10 bg-popover"
>
	<div
		bind:this={row}
		data-scroll-intent="x"
		class="relative -mx-4 no-scrollbar flex gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain border-b-hairline border-border px-4 py-2 group-data-at-top/sheet:touch-pan-x group-data-at-top/sheet:touch-pan-down"
	>
		{#each sections as section (section.key)}
			<button
				{@attach buttons.register(section.key)}
				type="button"
				data-slot="gaymoji-section-button"
				aria-label={section.title}
				aria-current={section.key === current ? "true" : undefined}
				class={[
					"flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
					{
						"bg-muted": section.key === current,
						"can-hover:hover:bg-muted/50": section.key !== current,
					},
				]}
				onclick={() => onPick(section.key)}
			>
				<MediaImage
					src={section.icon.imageUrl}
					fit="contain"
					skeleton
					size="xs"
					class="size-7"
				/>
			</button>
		{/each}
	</div>
</nav>
