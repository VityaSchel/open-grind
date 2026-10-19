<script lang="ts">
	import Link from "$lib/components/ui/link/Link.svelte";
	import { t } from "$lib/i18n";
</script>

{t("chat.giphy.consent.description")}
<Link
	href="https://support.giphy.com/hc/en-us/articles/360032872931-GIPHY-Privacy-Policy"
>
	{t("chat.giphy.consent.privacyPolicy")}
</Link>
