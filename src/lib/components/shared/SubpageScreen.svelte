<script lang="ts">
	import { afterNavigate, beforeNavigate } from "$app/navigation";
	import { page } from "$app/state";
	import { ArrowLeftIcon } from "phosphor-svelte";
	import type { Snippet } from "svelte";

	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import { provideSubpageActions } from "./subpage-actions-context.svelte";

	let {
		routes,
		parent,
		children,
	}: {
		routes: Record<string, { title: string; back: string; wide?: boolean }>;
		parent: string;
		children?: Snippet;
	} = $props();

	const actions = provideSubpageActions();

	const current = $derived(
		(page.route.id && routes[page.route.id]) ?? { title: "", back: parent },
	);

	let scroller: HTMLDivElement | null = $state(null);
	const offsets: Record<string, number> = {};

	beforeNavigate(({ from }) => {
		if (from && scroller) offsets[from.url.pathname] = scroller.scrollTop;
	});

	afterNavigate(({ from, to, type }) => {
		if (!scroller || !to || type === "enter") return;
		const saved = offsets[to.url.pathname];
		if (type === "popstate") {
			if (saved !== undefined) scroller.scrollTop = saved;
			return;
		}
		const up = from?.url.pathname.startsWith(`${to.url.pathname}/`);
		scroller.scrollTop = up ? (saved ?? 0) : 0;
	});
</script>

<ProgressiveBlur
	direction="topToBottom"
	class="fixed top-0 left-0 z-20 h-[calc(4.75rem+var(--safe-area-top))] w-full shrink-0"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="flex items-center h-full pe-5.5 pt-(--safe-area-top)"
	tag="nav"
>
	<a
		href={current.back}
		aria-label="Back"
		class="flex h-full w-19 shrink-0 items-center justify-center"
	>
		<ArrowLeftIcon size={32} />
	</a>
	<span class="min-w-0 flex-1 truncate">
		{current.title}
	</span>
	{@render actions.snippet?.()}
</ProgressiveBlur>
<main class="screen-nav-host">
	<div
		bind:this={scroller}
		class="h-full w-full overflow-y-auto overscroll-none"
		data-slot="subpage-scroller"
	>
		<div
			class="flex min-h-full w-full px-4 pt-header-clear-19 pb-nav-clear"
		>
			<div
				class={[
					"mx-auto flex w-full flex-col gap-3 pb-16",
					{
						"max-w-media-panel": current.wide,
						"max-w-120": !current.wide,
					},
				]}
			>
				{@render children?.()}
			</div>
		</div>
	</div>
</main>
