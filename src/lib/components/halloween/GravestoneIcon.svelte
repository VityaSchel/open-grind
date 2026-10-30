<script lang="ts">
	import type { HalloweenIconProps } from "./halloween";
	import HalloweenIcon from "./HalloweenIcon.svelte";

	let props: HalloweenIconProps = $props();
</script>

<HalloweenIcon viewBox="0 0 15 15" {...props}>
	<path
		fill="currentColor"
		d="M11.46 12h-.68L12 3.55c.02-.29-.2-.53-.49-.55h-1.25c0-.92-1.23-2-2.75-2S4.77 2.08 4.77 3H3.54a.517.517 0 0 0-.54.5v.05L4.2 12h-.65a.53.53 0 0 0-.55.5V14h9v-1.51a.53.53 0 0 0-.54-.49M4.5 5h6v1h-6z"
	/>
</HalloweenIcon>
