<script lang="ts">
	import { LockIcon } from "phosphor-svelte";

	let { still }: { still: string | null } = $props();

	let failed = $state(false);
</script>

<div
	data-slot="no-plays-left"
	class="relative flex size-full flex-col items-center justify-center gap-3 overflow-hidden bg-neutral-900 font-medium text-neutral-100"
>
	{#if still !== null && !failed}
		<img
			src={still}
			alt=""
			draggable="false"
			class="absolute inset-0 size-full scale-110 object-cover blur-2xl brightness-50"
			onerror={() => (failed = true)}
		/>
	{/if}
	<LockIcon weight="fill" class="relative aspect-square h-auto w-1/6" />
	<span class="relative">No plays left</span>
</div>
