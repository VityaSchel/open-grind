<script lang="ts">
	import { getNow, subscribeNow } from "$lib/now.svelte";

	let {
		onlineUntil,
		isVisiting,
		class: className,
	}: {
		onlineUntil: number | null | undefined;
		isVisiting: boolean | null | undefined;
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
    <span
        class={[
            "inline-block size-2 shrink-0",
            !isVisiting && "rounded-full bg-green-500",
            online ? "text-green-500" : "text-gray-400",
            className,
            ]}
            aria-label={title}
	        title={title}
    >
        {#if isVisiting}
            <!-- Author: michaelampr. MIT License-->
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="-1 -1 24 24"
                width="100%"
                height="100%"
                preserveAspectRatio="xMinYMin"
                class="scale-125"
            >
                <path
                    d='M12.685 13.285l-3.44 3.06.528 2.423-2.488 2.488-2.507-3.921-3.921-2.507 2.488-2.488L5.9 13l2.927-3.573-6.171-4.114 2.828-2.829L13.2 5.057l3.793-3.793c1.171-1.172 2.985-1.258 4.05-.193s.978 2.878-.193 4.05l-3.793 3.793 2.571 7.713-2.828 2.829-4.114-6.171z'
                />
            </svg>
        {/if}
    </span> 
{/if}
