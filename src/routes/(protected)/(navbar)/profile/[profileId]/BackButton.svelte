<script lang="ts">
	import ArrowLeftIcon from "phosphor-svelte/lib/ArrowLeftIcon";

	import BackLink from "$lib/components/navigation/BackLink.svelte";
	import { topChrome } from "$lib/util/screen-chrome.svelte";
</script>

<nav aria-label="Back">
	<BackLink
		href="/"
		{@attach topChrome}
		class="fixed top-[calc(0.75rem+var(--safe-area-top))] left-[calc(0.75rem+var(--safe-area-left))] z-20 flex media-disc items-center justify-center"
	>
		<ArrowLeftIcon weight="bold" class="size-6" />
	</BackLink>
</nav>
