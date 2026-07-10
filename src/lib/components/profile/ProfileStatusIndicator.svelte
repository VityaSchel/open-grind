<script lang="ts">
	import { AirplaneTiltIcon } from "phosphor-svelte";

	import { getNow, subscribeNow } from "$lib/util/now.svelte";

	let {
		onlineUntil,
		isVisiting,
		class: className,
	}: {
		onlineUntil: number | null | undefined;
		isVisiting?: boolean;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	$effect(() => subscribeNow());

	const online = $derived(onlineUntil != null && onlineUntil > getNow());
    const title = $derived.by(() => {
        if (online && isVisiting) {
            return 'Online now. Visiting';
        }
        if (online) {
            return 'Online now';
        }
        if (isVisiting) {
            return 'Visiting';
        }
    });
</script>

{#if isVisiting || online}
    <div
        class={[
            "flex shrink-0",
			{
				"text-green-500": online,
				"text-gray-400": !online
			},
			className,
		]}
		aria-label={title}
		title={title}
    >
        {#if isVisiting}
            <AirplaneTiltIcon weight="fill" class="size-3" />
		{:else}
			<span class="rounded-full bg-green-500 size-2"></span>
        {/if}
    </div> 
{/if}
