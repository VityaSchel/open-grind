<script lang="ts">
	let { children }: { children?: import("svelte").Snippet } = $props();
</script>

<div
	data-slot="profile-field"
	class="flex items-center gap-1.5 text-sm font-normal"
>
	{@render children?.()}
</div>
