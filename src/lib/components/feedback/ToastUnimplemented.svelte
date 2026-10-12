<script lang="ts">
	import WarningCircleIcon from "phosphor-svelte/lib/WarningCircleIcon";

	import Link from "$lib/components/ui/link/Link.svelte";

	let { feature, issue }: { feature: string; issue: number } = $props();
</script>

<span>
	<WarningCircleIcon weight="fill" class="me-1 inline size-5 align-middle" />
	TODO: {feature} not implemented yet, tracking in <Link
		href="https://git.opengrind.org/open-grind/open-grind/issues/{issue}"
	>
		#{issue}
	</Link>
</span>
