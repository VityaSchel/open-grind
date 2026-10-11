<script lang="ts">
	import {
		ChatsCircleIcon,
		CodeIcon,
		GlobeIcon,
		MegaphoneIcon,
	} from "phosphor-svelte";

	import { t } from "$lib/i18n";
	import Link from "./LinkItem.svelte";
</script>

<Link
	destination="https://opengrind.org/"
	label={t("settings.me.socials.website")}
>
	{#snippet icon()}
		<GlobeIcon weight="bold" class="size-5" />
	{/snippet}
</Link>

<Link
	destination="https://git.opengrind.org/open-grind/open-grind/"
	label={t("settings.me.socials.sourceCode")}
>
	{#snippet icon()}
		<CodeIcon weight="bold" class="size-5" />
	{/snippet}
</Link>
<Link
	destination="https://t.me/opengrind"
	label={t("settings.me.socials.announcements")}
	warning={{
		title: t("settings.me.socials.telegram.title"),
		description: t("settings.me.socials.telegram.description"),
		primary: {
			label: t("settings.me.socials.telegram.openTelegram"),
			destination: "https://t.me/opengrind",
		},
		secondary: {
			label: t("settings.me.socials.telegram.joinMatrix"),
			destination: "https://matrix.to/#/#announcements:opengrind.org",
		},
	}}
>
	{#snippet icon()}
		<MegaphoneIcon weight="bold" class="size-5" />
	{/snippet}
</Link>
<Link
	destination="https://matrix.to/#/#general:opengrind.org"
	label={t("settings.me.socials.discussion")}
>
	{#snippet icon()}
		<ChatsCircleIcon weight="bold" class="size-5" />
	{/snippet}
</Link>
