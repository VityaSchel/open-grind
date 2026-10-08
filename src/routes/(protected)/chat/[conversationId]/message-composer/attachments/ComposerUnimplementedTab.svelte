<script lang="ts">
	import SmileySadIcon from "phosphor-svelte/lib/SmileySadIcon";

	import * as Alert from "$lib/components/ui/alert";
	import Link from "$lib/components/ui/link/Link.svelte";
	import { t } from "$lib/i18n";
	import Rich from "$lib/i18n/Rich.svelte";
	import type { UnimplementedMessageKey } from "$lib/components/feedback/unimplemented";

	let {
		message,
		issue,
	}: { message: UnimplementedMessageKey; issue: number } = $props();
</script>

<div class="flex flex-1 py-16">
	<Alert.Root class="m-auto w-full max-w-sm">
		<SmileySadIcon size="2em" color="#ffba20" weight="fill" />
		<Alert.Title>{t("common.unimplemented.title")}</Alert.Title>
		<Alert.Description>
			<Rich key={message} issue={String(issue)}>
				{#snippet link(text)}<Link
						href="https://git.opengrind.org/open-grind/open-grind/issues/{issue}"
						>{text}</Link
					>{/snippet}
			</Rich>
		</Alert.Description>
	</Alert.Root>
</div>
