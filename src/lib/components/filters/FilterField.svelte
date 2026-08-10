<script lang="ts">
	let { children = $bindable() }: { children?: import("svelte").Snippet } =
		$props();
</script>

<div class="flex w-full items-center gap-3">
	{@render children?.()}
</div>
