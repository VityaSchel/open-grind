<script lang="ts">
	import { afterNavigate, beforeNavigate } from "$app/navigation";

	import SettingsNavBar from "../SettingsNavBar.svelte";

	let { children }: import("./$types").LayoutProps = $props();

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

<SettingsNavBar />
<main class="screen-nav-host">
	<div
		bind:this={scroller}
		class="h-full w-full overflow-y-auto overscroll-none"
		data-slot="settings-scroller"
	>
		<div class="flex min-h-full w-full px-4 pt-19 pb-nav-clear">
			<div class="mx-auto flex w-full max-w-120 flex-col gap-3 pb-16">
				{@render children?.()}
			</div>
		</div>
	</div>
</main>
