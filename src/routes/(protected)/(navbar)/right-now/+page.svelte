<script lang="ts">
	import SmileySadIcon from "phosphor-svelte/lib/SmileySadIcon";

	import IssueLink from "#lib/components/feedback/IssueLink.svelte";
	import * as Alert from "#lib/components/ui/alert/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import Rich from "#lib/i18n/Rich.svelte";
</script>

<svelte:head>
	<title>{t("shell.navBar.tabs.rightNow")}</title>
</svelte:head>

<main class="flex flex-1 px-8">
	<Alert.Root class="m-auto w-full max-w-sm">
		<SmileySadIcon size="2em" color="#ffba20" weight="fill" />
		<Alert.Title>{t("common.unimplemented.title")}</Alert.Title>
		<Alert.Description>
			<Rich key="browse.rightNow.unimplemented">
				{#snippet issueLink()}<IssueLink issue={43} />{/snippet}
			</Rich>
		</Alert.Description>
	</Alert.Root>
</main>
