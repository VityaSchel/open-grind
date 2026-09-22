<script lang="ts">
	import { onNavigate } from "$app/navigation";
	import { prefersReducedMotion } from "svelte/motion";
	import type { Attachment } from "svelte/attachments";

	import { attachSystemBackGesture } from "$lib/platform/system-back-gesture";
	import { PageStack } from "./page-stack/model.svelte";
	import { STACK_Z } from "./page-stack/motion";
	import { trackScrolled } from "./page-stack/snapshot";
	import { paneSurface } from "./page-stack/surface";

	let {
		scope,
		children,
	}: { scope: string; children?: import("svelte").Snippet } = $props();

	let pane: HTMLElement | null = $state(null);
	let dim: HTMLElement | null = $state(null);

	const stack: PageStack = new PageStack({
		surface: paneSurface({
			panes: () => {
				const ghost = stack.ghost?.node ?? null;
				return stack.liveRole === "front"
					? { front: pane, back: ghost, dim }
					: { front: ghost, back: pane, dim };
			},
			parallax: () => !prefersReducedMotion.current,
		}),
		livePane: () => pane,
		reducedMotion: () => prefersReducedMotion.current,
		inScope: (pathname) =>
			pathname === scope || pathname.startsWith(`${scope}/`),
	});

	const liveZ = $derived(
		stack.liveRole === "front" ? STACK_Z.front : STACK_Z.back,
	);
	const ghostZ = $derived(
		stack.liveRole === "front" ? STACK_Z.back : STACK_Z.front,
	);

	const mountGhost: Attachment<HTMLElement> = (host) => {
		const snapshot = stack.ghost;
		if (!snapshot) return;
		snapshot.node.style.zIndex = ghostZ;
		host.append(snapshot.node);
		return () => snapshot.node.remove();
	};

	onNavigate((navigation) => stack.navigate(navigation));

	$effect(() => attachSystemBackGesture(stack));
</script>

<div class="contents" {@attach mountGhost}>
	<div
		bind:this={pane}
		{@attach trackScrolled}
		data-slot="page-stack-pane"
		class="fixed inset-0 bg-background pt-(--safe-area-top) pb-(--content-pb)"
		style:z-index={liveZ}
	>
		{@render children?.()}
	</div>
	{#if stack.ghost}
		<div
			bind:this={dim}
			data-slot="page-stack-dim"
			class="pointer-events-none fixed inset-0 bg-black opacity-0"
			style:z-index={STACK_Z.dim}
		></div>
	{/if}
</div>
