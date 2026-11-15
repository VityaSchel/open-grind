<script lang="ts">
	let { checked }: { checked: boolean } = $props();
</script>

<span
	class={[
		"flex size-5 items-center justify-center rounded-full border-2",
		{ "border-primary": checked, "border-muted-foreground/70": !checked },
	]}
>
	{#if checked}
		<span class="size-2.5 rounded-full bg-primary"></span>
	{/if}
</span>
