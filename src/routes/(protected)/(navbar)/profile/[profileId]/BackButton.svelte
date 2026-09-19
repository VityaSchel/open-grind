<script lang="ts">
	import { ArrowLeftIcon } from "phosphor-svelte";

	import BackLink from "$lib/components/navigation/BackLink.svelte";
</script>

<BackLink
	href="/"
	class="fixed top-[calc(0.75rem+var(--safe-area-top))] left-[calc(0.75rem+var(--safe-area-left))] z-20 flex size-11 items-center justify-center rounded-full bg-black/55 scrim text-white backdrop-filter-(--bd-veil) transition-colors can-hover:hover:bg-black/75"
>
	<ArrowLeftIcon weight="bold" class="size-6" />
</BackLink>
