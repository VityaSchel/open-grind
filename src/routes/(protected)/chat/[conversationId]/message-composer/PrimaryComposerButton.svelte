<script lang="ts">
	import { expoOut } from "svelte/easing";
	import { fade } from "svelte/transition";

	import ComposerButton from "./ComposerButton.svelte";

	let { class: className, ...props }: import("svelte").ComponentProps<typeof ComposerButton> =
		$props();
</script>

<div class="block" transition:fade={{ duration: 400, easing: expoOut }}>
	<ComposerButton {...props} class={["absolute bottom-0 right-0 rounded-e-2xl", className]} />
</div>
