<script lang="ts">
	import {
		MATURE_CONTENT_SETTING_ID,
		matureContentCovered,
	} from "#lib/components/mature-content/mature-content.ts";
	import { hapticsAvailable } from "#lib/haptics.ts";
	import { t } from "#lib/i18n/index.ts";
	import { desktopEntryAvailable } from "#lib/platform/desktop-entry.svelte.ts";
	import PreferenceSwitchSetting from "../PreferenceSwitchSetting.svelte";
	import AppsMenuEntrySetting from "./AppsMenuEntrySetting.svelte";
	import BackdropBlurSetting from "./BackdropBlurSetting.svelte";
	import UnitsSetting from "./UnitsSetting.svelte";
</script>

{#if matureContentCovered()}
	<PreferenceSwitchSetting
		id={MATURE_CONTENT_SETTING_ID}
		preference="showMatureContent"
		title={t("settings.app.showMatureContent.title")}
		description={t("settings.app.showMatureContent.description")}
	/>
{/if}
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
