<script lang="ts">
	import { t } from "$lib/i18n";
	import PreferenceSwitchSetting from "../PreferenceSwitchSetting.svelte";
</script>

<PreferenceSwitchSetting
	preference="stayOnline"
	title={t("settings.app.stayOnline.title")}
	description={t("settings.app.stayOnline.description")}
/>
<PreferenceSwitchSetting
	preference="revealMessageRead"
	title={t("settings.app.revealMessageRead.title")}
	description={t("settings.app.revealMessageRead.description")}
/>
<PreferenceSwitchSetting
	preference="revealProfileViews"
	title={t("settings.app.revealProfileViews.title")}
	description={t("settings.app.revealProfileViews.description")}
/>
<PreferenceSwitchSetting
	preference="giphyConsent"
	title={t("settings.app.giphy.title")}
	description={t("settings.app.giphy.description")}
/>
