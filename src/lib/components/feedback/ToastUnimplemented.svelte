<script lang="ts">
	import { WarningCircleIcon } from "phosphor-svelte";

	import Link from "$lib/components/ui/link/Link.svelte";
	import Rich from "$lib/i18n/Rich.svelte";
	import type { UnimplementedMessageKey } from "./unimplemented";

	let {
		message,
		issue,
	}: { message: UnimplementedMessageKey; issue: number } = $props();
</script>

<span>
	<WarningCircleIcon weight="fill" class="me-1 inline size-5 align-middle" />
	<Rich key={message} issue={String(issue)}>
		{#snippet link(text)}<Link
				href="https://git.opengrind.org/open-grind/open-grind/issues/{issue}"
				>{text}</Link
			>{/snippet}
	</Rich>
</span>
