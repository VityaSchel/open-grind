<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";

	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";

	let {
		open = $bindable(false),
		...restProps
	}: DropdownMenuPrimitive.RootProps = $props();

	dismissOnBackGesture({
		active: () => open,
		dismiss: () => {
			open = false;
		},
	});
</script>

<DropdownMenuPrimitive.Root bind:open {...restProps} />
