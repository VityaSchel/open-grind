<script lang="ts">
	let { children }: { children: import("svelte").Snippet } = $props();
</script>

<main
	class="flex min-h-dvh w-full pt-[calc(2rem+var(--safe-area-top))] px-safe-8 pb-[calc(2rem+var(--safe-area-bottom))]"
>
	{@render children?.()}
</main>
