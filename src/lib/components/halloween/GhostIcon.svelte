<script lang="ts">
	import type { HalloweenIconProps } from "./halloween";
	import HalloweenIcon from "./HalloweenIcon.svelte";

	let props: HalloweenIconProps = $props();
</script>

<HalloweenIcon viewBox="0 0 24 24" {...props}>
	<path
		fill="currentColor"
		d="M12 2a9 9 0 0 0-9 9v11l3-3l3 3l3-3l3 3l3-3l3 3V11a9 9 0 0 0-9-9M9 8a2 2 0 0 1 2 2a2 2 0 0 1-2 2a2 2 0 0 1-2-2a2 2 0 0 1 2-2m6 0a2 2 0 0 1 2 2a2 2 0 0 1-2 2a2 2 0 0 1-2-2a2 2 0 0 1 2-2"
	/>
</HalloweenIcon>
