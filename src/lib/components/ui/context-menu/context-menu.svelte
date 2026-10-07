<script lang="ts" module>
	let openMenuCount = 0;
</script>

<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from "bits-ui";

	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";

	let {
		open = $bindable(false),
		...restProps
	}: ContextMenuPrimitive.RootProps = $props();

	dismissOnBackGesture({
		active: () => open,
		dismiss: () => {
			open = false;
		},
	});

	$effect(() => {
		if (!open) return;
		openMenuCount++;
		if (openMenuCount === 1) {
			document.documentElement.setAttribute("data-context-menu-open", "");
		}
		return () => {
			openMenuCount--;
			if (openMenuCount === 0) {
				document.documentElement.removeAttribute(
					"data-context-menu-open",
				);
			}
		};
	});
</script>

<ContextMenuPrimitive.Root bind:open {...restProps} />
