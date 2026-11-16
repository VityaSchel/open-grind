<script lang="ts">
	import AutomaticUpdatesSetting from "./AutomaticUpdatesSetting.svelte";
	import { updateSettingsOffered } from "./update-settings-offered";
</script>

{#if updateSettingsOffered()}
	<AutomaticUpdatesSetting />
{/if}
