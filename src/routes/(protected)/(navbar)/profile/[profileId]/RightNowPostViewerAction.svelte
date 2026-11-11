<script lang="ts">
	import FlagIcon from "phosphor-svelte/lib/FlagIcon";
	import PencilIcon from "phosphor-svelte/lib/PencilIcon";

	import { Spinner } from "#lib/components/ui/spinner/index.ts";

	let {
		own,
		onreport,
		onedit,
	}: { own: boolean; onreport: () => Promise<void>; onedit: () => void } =
		$props();

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

{#if own}
	<button
		type="button"
		class="flex media-disc w-auto items-center gap-1.5 px-4 text-sm font-medium"
		onclick={onedit}
	>
		<PencilIcon weight="fill" class="size-5" />
		Edit post
	</button>
{:else}
	<button
		type="button"
		class="grid media-disc place-items-center"
		aria-label="Report post"
		aria-busy={checking}
		onclick={() => void report()}
	>
		{#if checking}
			<Spinner aria-hidden="true" class="size-6" />
		{:else}
			<FlagIcon weight="bold" class="size-6" />
		{/if}
	</button>
{/if}
