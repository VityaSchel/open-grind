<script lang="ts">
	import { expoOut, sineIn } from "svelte/easing";
	import { prefersReducedMotion } from "svelte/motion";
	import type { Snippet } from "svelte";
	import type { TransitionConfig } from "svelte/transition";

	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import { Spinner } from "$lib/components/ui/spinner";
	import { cn } from "$lib/util/utils";

	let {
		label,
		count,
		showCount = true,
		busy = false,
		aboveTabBar = false,
		onSubmit,
		leading,
	}: {
		label: string;
		count: number;
		showCount?: boolean;
		busy?: boolean;
		aboveTabBar?: boolean;
		onSubmit: () => void;
		leading?: Snippet;
	} = $props();

	const FLIGHT_PX = 100;

	const flyFromBelow: (
		node: Element,
	) => (options?: { direction?: "in" | "out" }) => TransitionConfig =
		() => (options) => {
			const intro = options?.direction === "in";
			return {
				duration: intro ? 600 : 400,
				easing: intro ? expoOut : sineIn,
				css: (t, u) =>
					prefersReducedMotion.current
						? `opacity: ${t}`
						: `transform: translateY(${u * FLIGHT_PX}px); opacity: ${t}`,
			};
		};
</script>

{#if count > 0}
	<div
		data-slot="sheet-actions"
		class={cn(
			"pointer-events-none absolute inset-x-0 bottom-6 flex justify-center gap-2 *:pointer-events-auto",
			{
				"bottom-[calc(--spacing(18)+var(--bar-content-gap))] z-20":
					aboveTabBar,
			},
		)}
		transition:flyFromBelow
	>
		{@render leading?.()}
		<Button
			size="lg"
			class="shadow-lg"
			disabled={busy}
			aria-busy={busy}
			onclick={onSubmit}
		>
			{#if busy}
				<Spinner aria-hidden="true" />
			{/if}
			{label}
			{#if showCount}
				<Badge
					variant="secondary"
					class="bg-primary-foreground/10 text-primary-foreground"
				>
					{count}
				</Badge>
			{/if}
		</Button>
	</div>
{/if}
