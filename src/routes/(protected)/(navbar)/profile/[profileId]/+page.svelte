<script lang="ts">
	import { t } from "#lib/i18n/index.ts";
	import BackButton from "./BackButton.svelte";
	import ProfilePager from "./pager/ProfilePager.svelte";

	let { data }: import("./$types").PageProps = $props();
</script>

<svelte:head>
	<title>{t("profile.page.title")}</title>
</svelte:head>

<BackButton />
<ProfilePager ourProfileId={data.ourProfileId} />
