<script lang="ts">
	import type { LoadedEntry } from "$lib/credits";
	import BlurbText from "./BlurbText.svelte";
	import LicenseDisclosure from "./LicenseDisclosure.svelte";

	let { entry }: { entry: LoadedEntry } = $props();
</script>

<div class="flex min-w-0 flex-col gap-0.5 px-1 py-1.5" data-slot="credit-row">
	<BlurbText name={entry.name} url={entry.url} />
	<LicenseDisclosure {entry} />
</div>
