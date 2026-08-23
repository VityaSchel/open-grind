<script lang="ts">
	import SelectionCheck from "./SelectionCheck.svelte";

	let { class: className }: { class?: import("svelte/elements").ClassValue } =
		$props();
</script>

<div
	class={[
		"absolute inset-0 flex items-center justify-center rounded-[inherit] bg-primary/50 outline-2 -outline-offset-2 outline-primary",
		className,
	]}
>
	<SelectionCheck />
</div>
