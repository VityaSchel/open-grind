<script lang="ts">
	let { children = $bindable() }: { children?: import("svelte").Snippet } =
		$props();
</script>

<div class="field">
	{@render children?.()}
</div>

<style lang="postcss">
	@reference "tailwindcss";

	.field {
		@apply flex w-full items-center gap-3;
	}
</style>
