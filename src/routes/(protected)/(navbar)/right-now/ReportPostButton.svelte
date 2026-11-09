<script lang="ts">
	import FlagIcon from "phosphor-svelte/lib/FlagIcon";

	import { Button } from "#lib/components/ui/button/index.ts";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";

	let { onreport }: { onreport: () => Promise<void> } = $props();

	let checking = $state(false);

	async function report() {
		if (checking) return;
		checking = true;
		try {
			await onreport();
		} finally {
			checking = false;
		}
	}
</script>

<Button
	variant="ghost"
	size="icon-sm"
	class="-my-1 -me-2 shrink-0 text-muted-foreground"
	aria-label="Report post"
	aria-busy={checking}
	onclick={() => void report()}
>
	{#if checking}
		<Spinner aria-hidden="true" />
	{:else}
		<FlagIcon class="size-4" />
	{/if}
</Button>
