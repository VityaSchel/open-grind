<script lang="ts">
	let { children }: { children: import("svelte").Snippet } = $props();
</script>

<main class="flex min-h-dvh w-full p-safe-8">
	{@render children?.()}
</main>
