<script lang="ts">
	import Link from "$lib/components/ui/link/Link.svelte";

	let { issue }: { issue: number } = $props();
</script>

<Link href="https://git.opengrind.org/open-grind/open-grind/issues/{issue}"
	>#{issue}</Link
>
