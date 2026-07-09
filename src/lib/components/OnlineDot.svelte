<script lang="ts">
	import { getNow, subscribeNow } from "$lib/now.svelte";

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
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 256 256"
                width="100%"
                height="100%"
                class="scale-125"
            >
                <!-- Phosphor. MIT License-->
                <path
                    d="M215.52,197.26a8,8,0,0,1-1.86,8.39l-24,24A8,8,0,0,1,184,232a7.09,7.09,0,0,1-.79,0,8,8,0,0,1-5.87-3.52l-44.07-66.12L112,183.59V208a8,8,0,0,1-2.34,5.65s-14,14.06-15.88,15.88A7.91,7.91,0,0,1,91,231.41a8,8,0,0,1-10.41-4.35l-.06-.15-14.7-36.76L29,175.42a8,8,0,0,1-2.69-13.08l16-16A8,8,0,0,1,48,144H72.4l21.27-21.27L27.56,78.65a8,8,0,0,1-1.22-12.32l24-24a8,8,0,0,1,8.39-1.86l85.94,31.25L176.2,40.19a28,28,0,0,1,39.6,39.6l-31.53,31.53Z"
                />
            </svg>
        {/if}
    </span> 
{/if}
