<script lang="ts">
	import { hapticsAvailable } from "$lib/haptics";
	import { t } from "$lib/i18n";
	import { desktopEntryAvailable } from "$lib/platform/desktop-entry.svelte";
	import PreferenceSwitchSetting from "../PreferenceSwitchSetting.svelte";
	import AppsMenuEntrySetting from "./AppsMenuEntrySetting.svelte";
	import BackdropBlurSetting from "./BackdropBlurSetting.svelte";
	import UnitsSetting from "./UnitsSetting.svelte";
</script>

<UnitsSetting />
<BackdropBlurSetting />
{#if hapticsAvailable()}
	<PreferenceSwitchSetting
		preference="hapticFeedback"
		title={t("settings.app.hapticFeedback.title")}
		description={t("settings.app.hapticFeedback.description")}
	/>
{/if}
{#if desktopEntryAvailable()}
	<AppsMenuEntrySetting />
{/if}
