<script lang="ts">
	import ImagesIcon from "phosphor-svelte/lib/ImagesIcon";
	import ProhibitIcon from "phosphor-svelte/lib/ProhibitIcon";

	import { mediaDrop } from "$lib/platform/media-intake.svelte";
</script>

{#if mediaDrop.label !== null}
	<div
		data-slot="media-drop-overlay"
		class="pointer-events-none fixed inset-0 z-drop bg-black/30 scrim pt-[calc(var(--safe-area-top)_+_--spacing(4))] pr-[calc(var(--safe-area-right)_+_--spacing(4))] pb-[calc(var(--safe-area-bottom)_+_--spacing(4))] pl-[calc(var(--safe-area-left)_+_--spacing(4))] backdrop-filter-(--bd-veil)"
	>
		<div
			data-slot="media-drop-zone"
			class="flex size-full flex-col items-center justify-center gap-3 rounded-4xl border-2 border-dashed border-white/60 px-8 text-center text-lg font-medium text-balance text-white"
		>
			{#if mediaDrop.refusal === null}
				<ImagesIcon class="size-10 shrink-0" />
				<p>{mediaDrop.label}</p>
			{:else}
				<ProhibitIcon class="size-10 shrink-0" />
				<p>{mediaDrop.refusal}</p>
			{/if}
		</div>
	</div>
{/if}
