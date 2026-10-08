<script lang="ts">
	import { expoOut, sineIn } from "svelte/easing";
	import type { Snippet } from "svelte";

	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import { Spinner } from "$lib/components/ui/spinner";
	import { fly } from "$lib/util/reduced-motion";
	import { cn } from "$lib/util/utils";

	let {
		label,
		count,
		busy = false,
		onSubmit,
		class: className,
		leading,
	}: {
		label: string;
		count: number;
		busy?: boolean;
		onSubmit: () => void;
		class?: string;
		leading?: Snippet;
	} = $props();
</script>

{#if count > 0}
	<div
		data-slot="sheet-actions"
		class={cn(
			"pointer-events-none absolute inset-x-0 bottom-6 flex justify-center gap-2 *:pointer-events-auto",
			className,
		)}
		in:fly={{ duration: 600, y: 100, easing: expoOut }}
		out:fly={{ duration: 400, y: 100, easing: sineIn }}
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
			<Badge
				variant="secondary"
				class="bg-primary-foreground/10 text-primary-foreground"
			>
				{count}
			</Badge>
		</Button>
	</div>
{/if}
