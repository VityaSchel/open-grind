<script lang="ts">
	let { children }: { children: import("svelte").Snippet } = $props();
</script>

<main
	class="flex min-h-dvh w-full px-8 pt-[calc(2rem+var(--safe-area-top))] pb-[calc(2rem+var(--safe-area-bottom))]"
>
	{@render children?.()}
</main>
