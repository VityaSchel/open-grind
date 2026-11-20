<script lang="ts">
	import { expoOut } from "svelte/easing";
	import { fade } from "svelte/transition";

	import { softKeyboardVisibility } from "#lib/platform/native-insets.ts";
	import ComposerButton from "./ComposerButton.svelte";

	let {
		class: className,
		keepsSoftKeyboardUp = false,
		...props
	}: import("svelte").ComponentProps<typeof ComposerButton> & {
		keepsSoftKeyboardUp?: boolean;
	} = $props();

	function holdFieldFocus(event: Event) {
		if (keepsSoftKeyboardUp && softKeyboardVisibility() !== false)
			event.preventDefault();
	}
</script>

<div class="block" transition:fade={{ duration: 400, easing: expoOut }}>
	<ComposerButton
		onpointerdown={holdFieldFocus}
		onmousedown={holdFieldFocus}
		{...props}
		class={[
			"absolute inset-e-0 bottom-0 rounded-e-composer pe-3",
			className,
		]}
	/>
</div>
