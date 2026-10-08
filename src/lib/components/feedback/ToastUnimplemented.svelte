<script lang="ts">
	import { WarningCircleIcon } from "phosphor-svelte";

	import Rich from "$lib/i18n/Rich.svelte";
	import IssueLink from "./IssueLink.svelte";
	import type { UnimplementedMessageKey } from "./unimplemented";

	let {
		message,
		issue,
	}: { message: UnimplementedMessageKey; issue: number } = $props();
</script>

<span>
	<WarningCircleIcon weight="fill" class="me-1 inline size-5 align-middle" />
	<Rich key={message}>
		{#snippet issueLink()}<IssueLink {issue} />{/snippet}
	</Rich>
</span>
