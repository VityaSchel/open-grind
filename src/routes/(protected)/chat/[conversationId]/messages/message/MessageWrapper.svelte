<script lang="ts">
	import type { Snippet } from "svelte";

	import { setMessageMetaContext } from "./context";

	let {
		clone = false,
		setRef,
		adornments,
		children,
	}: {
		clone?: boolean;
		setRef: (el: HTMLElement | null) => void;
		adornments?: Snippet;
		children: Snippet;
	} = $props();

	setMessageMetaContext(() => ({
		clone,
		setRef: clone ? () => {} : setRef,
		adornments: clone ? undefined : adornments,
	}));
</script>

{@render children()}
