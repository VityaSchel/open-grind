<script lang="ts">
	import { afterNavigate } from "$app/navigation";
	import { ArrowLeftIcon } from "phosphor-svelte";

	let leaving = false;

	afterNavigate(() => {
		leaving = false;
	});
</script>

<a
	href="/"
	aria-label="Back"
	class="fixed top-[calc(0.75rem+var(--safe-area-top))] left-[calc(0.75rem+var(--safe-area-left))] z-20 flex size-11 items-center justify-center rounded-full bg-black/55 scrim text-white backdrop-filter-(--bd-veil) transition-colors can-hover:hover:bg-black/75"
	onclick={(event) => {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
			return;
		if (leaving) {
			event.preventDefault();
			return;
		}
		leaving = true;

		if (window.navigation?.canGoBack ?? history.length > 1) {
			event.preventDefault();
			history.back();
		}
	}}
>
	<ArrowLeftIcon weight="bold" class="size-6" />
</a>
