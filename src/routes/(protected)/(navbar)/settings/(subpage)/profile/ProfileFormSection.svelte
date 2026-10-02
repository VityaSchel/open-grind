<script lang="ts">
	import type { Snippet } from "svelte";

	let { title, children }: { title?: string; children: Snippet } = $props();
</script>

<section data-slot="profile-form-section" class="flex flex-col gap-3">
	{#if title !== undefined}
		<h2 class="truncate ps-1 text-xl font-semibold tracking-tight">
			{title}
		</h2>
	{/if}
	{@render children()}
</section>
