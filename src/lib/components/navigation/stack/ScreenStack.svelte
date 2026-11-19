<script lang="ts">
	import { onNavigate } from "$app/navigation";
	import { prefersReducedMotion } from "svelte/motion";
	import type { Snippet } from "svelte";
	import type { Attachment } from "svelte/attachments";

	import { attachSystemBackGesture } from "#lib/platform/system-back-gesture.svelte.ts";
	import { navigationPending } from "#lib/util/history.ts";
	import { STACK_Z, stackMotion } from "./motion";
	import { currentNavBarRider, currentScreenRoot } from "./screen-root";
	import { screenSnapshots } from "./screen-snapshots.svelte";
	import { ScreenStackState } from "./screen-stack-state.svelte";
	import { frontClearedAtRest, paneSurface } from "./surface";

	let { children }: { children: Snippet } = $props();

	const motion = stackMotion();

	let host: HTMLElement | null = $state(null);
	let dim: HTMLElement | null = $state(null);

	const front = () => (stack.covering ? null : currentScreenRoot());
	const rider = () =>
		stack.covering || stack.staged?.showsNavBar !== false
			? null
			: currentNavBarRider();

	const stack: ScreenStackState = new ScreenStackState({
		surface: frontClearedAtRest({
			surface: paneSurface({
				panes: () => ({
					front: front(),
					back: host,
					dim,
					rider: rider(),
				}),
				parallax: () => !prefersReducedMotion.current,
				motion,
			}),
			front,
			rider,
		}),
		motion,
		reducedMotion: () => prefersReducedMotion.current,
		snapshots: screenSnapshots,
		root: currentScreenRoot,
		front: currentScreenRoot,
		navBar: currentNavBarRider,
		navigationPending: () => navigationPending({ owns: () => false }),
	});

	const mountGhost: Attachment<HTMLElement> = (target) => {
		const snapshot = stack.staged;
		if (!snapshot) return;
		target.append(snapshot.node);
		return () => snapshot.node.remove();
	};

	onNavigate((navigation) => stack.navigate(navigation));

	$effect(() => attachSystemBackGesture(stack));

	$effect(() => {
		const raised = stack.staged === null ? null : stack.front;
		if (!raised) return;
		raised.toggleAttribute("data-raised", true);
		raised.style.zIndex = STACK_Z.front;
		return () => {
			raised.removeAttribute("data-raised");
			raised.style.removeProperty("z-index");
		};
	});

	$effect(() => {
		const riding =
			stack.staged?.showsNavBar === false ? currentNavBarRider() : null;
		if (!riding) return;
		return () => riding.style.removeProperty("transform");
	});

	$effect(() => {
		if (!stack.committing) return;
		const leaving = [stack.front, rider()].filter(
			(element) => element !== null,
		);
		for (const element of leaving) element.inert = true;
		return () => {
			for (const element of leaving) element.inert = false;
		};
	});
</script>

{@render children()}
{#if stack.staged}
	<div
		bind:this={host}
		{@attach mountGhost}
		data-slot="screen-stack-host"
		class={[
			"pointer-events-none fixed inset-0 overflow-hidden",
			{
				invisible: !stack.revealed,
				"**:data-[slot=navbar]:invisible": !stack.covering,
				"**:data-[slot=screen-ghost-navbar]:invisible":
					currentNavBarRider() !== null,
			},
		]}
		style:z-index={stack.covering ? STACK_Z.cover : STACK_Z.back}
	></div>
	{#if stack.moving}
		<div
			bind:this={dim}
			data-slot="screen-stack-dim"
			class="pointer-events-none fixed inset-0 bg-[rgb(0_0_0/var(--stack-scrim))] opacity-0"
			style:z-index={STACK_Z.dim}
		></div>
	{/if}
{/if}
