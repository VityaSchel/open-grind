<script lang="ts" generics="Item">
	import MediaSheet from "./MediaSheet.svelte";
	import type { PreviousUploadsProps } from "./previous-uploads";
	import PreviousUploads from "./PreviousUploads.svelte";

	let {
		open = $bindable(),
		...props
	}: { open: boolean } & PreviousUploadsProps<Item> = $props();
</script>

<MediaSheet bind:open>
	<PreviousUploads {...props} onClose={() => (open = false)} />
</MediaSheet>
