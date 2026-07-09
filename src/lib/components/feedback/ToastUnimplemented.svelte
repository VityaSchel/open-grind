<script lang="ts">
	import { WarningCircleIcon } from "phosphor-svelte";

	import Link from "$lib/components/ui/link/Link.svelte";

	let {
		feature,
		issue,
	}: {
		feature: string;
		issue: number;
	} = $props();
</script>

<span>
	<WarningCircleIcon weight="fill" class="inline size-5 align-middle me-1" />
	TODO: {feature} not implemented yet, tracking in <Link
		href="https://git.opengrind.org/open-grind/open-grind/issues/{issue}"
	>
		#{issue}
	</Link>
</span>
