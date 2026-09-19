<script lang="ts">
	import { onNavigate } from "$app/navigation";
	import { prefersReducedMotion } from "svelte/motion";
	import type { Attachment } from "svelte/attachments";

	import { PageStack } from "./page-stack/model.svelte";
	import { paneSurface } from "./page-stack/surface";
	import { attachSystemBackGesture } from "./page-stack/system-back";

	let {
		scope,
		children,
	}: { scope: string; children?: import("svelte").Snippet } = $props();

	const FRONT_Z = "12";
	const DIM_Z = "11";
	const BACK_Z = "10";

	let pane: HTMLElement | null = $state(null);
	let dim: HTMLElement | null = $state(null);

	const stack: PageStack = new PageStack({
		surface: paneSurface({
			panes: () => ({
				front:
					stack.liveRole === "front"
						? pane
						: (stack.ghost?.node ?? null),
				back:
					stack.liveRole === "front"
						? (stack.ghost?.node ?? null)
						: pane,
				dim,
			}),
			parallax: () => !prefersReducedMotion.current,
		}),
		livePane: () => pane,
		reducedMotion: () => prefersReducedMotion.current,
		inScope: (pathname) =>
			pathname === scope || pathname.startsWith(`${scope}/`),
	});

	const liveZ = $derived(stack.liveRole === "front" ? FRONT_Z : BACK_Z);

	const mountGhost: Attachment<HTMLElement> = (host) => {
		const snapshot = stack.ghost;
		if (!snapshot) return;
		snapshot.node.style.zIndex =
			stack.liveRole === "front" ? BACK_Z : FRONT_Z;
		host.append(snapshot.node);
		return () => snapshot.node.remove();
	};

	onNavigate((navigation) => stack.navigate(navigation));

	$effect(() =>
		attachSystemBackGesture({
			begin: () => stack.beginSwipeBack(),
			track: (progress) => stack.trackSwipeBack(progress),
			commit: () => stack.commitSwipeBack(),
			cancel: () => stack.cancelSwipeBack(),
			tracking: () => stack.tracking,
		}),
	);
</script>

<div class="contents" {@attach mountGhost}>
	<div
		bind:this={pane}
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
			style:z-index={DIM_Z}
		></div>
	{/if}
</div>
