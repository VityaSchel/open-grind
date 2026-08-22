<script lang="ts">
	import XIcon from "phosphor-svelte/lib/XIcon";
	import type { Component, Snippet } from "svelte";

	let {
		icon: Icon,
		title,
		body,
		tone = "default",
		onActivate,
		onCancel,
		children,
	}: {
		icon: Component<{ weight?: "fill"; class?: string }>;
		title: string;
		body?: string;
		tone?: "default" | "error";
		onActivate?: () => void;
		onCancel?: () => void;
		children?: Snippet;
	} = $props();

	const tapSlop = 10;

	let card = $state<HTMLDivElement | null>(null);
	let pressedAt: { x: number; y: number } | null = null;

	const surface = $derived([
		"flex w-full items-center gap-3 rounded-2xl border p-4 text-start",
		tone === "error"
			? "border-destructive bg-destructive text-background"
			: "border-border bg-popover",
	]);

	function press(event: PointerEvent): void {
		if (event.button !== 0) {
			event.stopPropagation();
			return;
		}
		pressedAt = { x: event.clientX, y: event.clientY };
	}

	function release(event: PointerEvent): void {
		const start = pressedAt;
		pressedAt = null;
		if (!start || !onActivate) return;

		const travelled =
			Math.abs(event.clientX - start.x) +
			Math.abs(event.clientY - start.y);
		const box = card?.getBoundingClientRect();
		if (travelled > tapSlop || !box) return;

		const released =
			event.clientX >= box.left &&
			event.clientX <= box.right &&
			event.clientY >= box.top &&
			event.clientY <= box.bottom;
		if (released) onActivate();
	}

	function activateOnKey(event: KeyboardEvent): void {
		if (!onActivate || (event.key !== "Enter" && event.key !== " ")) return;
		event.preventDefault();
		onActivate();
	}
</script>

{#snippet content()}
	<Icon weight="fill" class="size-8 shrink-0" />
	<div class="flex min-w-0 flex-1 flex-col gap-0.5">
		<span class="font-heading text-sm leading-snug font-medium">
			{title}
		</span>
		{#if body}
			<span
				class={[
					"text-xs leading-snug",
					{
						"text-background/80": tone === "error",
						"text-muted-foreground": tone !== "error",
					},
				]}
			>
				{body}
			</span>
		{:else}
			{@render children?.()}
		{/if}
	</div>
	{#if onCancel}
		<button
			type="button"
			aria-label="Stop the download"
			class="-mr-1 shrink-0 cursor-pointer p-1 text-muted-foreground hover:text-foreground"
			onpointerdown={(event) => event.stopPropagation()}
			onclick={onCancel}
		>
			<XIcon class="size-5" />
		</button>
	{/if}
{/snippet}

{#if onActivate}
	<div
		bind:this={card}
		role="button"
		tabindex="0"
		class={[surface, "cursor-pointer"]}
		onpointerdown={press}
		onpointerup={release}
		onpointercancel={() => (pressedAt = null)}
		onkeydown={activateOnKey}
	>
		{@render content()}
	</div>
{:else}
	<div bind:this={card} role="status" class={surface}>
		{@render content()}
	</div>
{/if}
