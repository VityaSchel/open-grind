<script lang="ts">
	import CheckIcon from "phosphor-svelte/lib/CheckIcon";

	let {
		class: className,
	}: {
		class?: import("svelte/elements").ClassValue;
	} = $props();
</script>

<div
	class={[
		"flex size-8 items-center justify-center rounded-full bg-primary",
		className,
	]}
>
	<CheckIcon weight="bold" class="size-5 text-white" />
</div>
