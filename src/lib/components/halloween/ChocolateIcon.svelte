<script lang="ts">
	import type { HalloweenIconProps } from "./halloween";
	import HalloweenIcon from "./HalloweenIcon.svelte";

	let props: HalloweenIconProps = $props();
</script>

<HalloweenIcon viewBox="0 0 24 24" {...props}>
	<path
		fill="none"
		stroke="currentColor"
		stroke-linecap="round"
		stroke-linejoin="round"
		stroke-width="2"
		d="M12 21V5M6 15h12M6 9h10.5m-6.45-6a2.5 2.5 0 0 0 3.987 1.47a3 3 0 0 0 2.047 2.387A2.504 2.504 0 0 0 18 9.95V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
	/>
</HalloweenIcon>
