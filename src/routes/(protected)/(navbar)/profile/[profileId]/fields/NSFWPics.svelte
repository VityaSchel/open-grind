<script lang="ts">
	import { CameraIcon } from "phosphor-svelte";

	import {
		type AcceptNSFWPicsId,
		acceptNSFWPics as acceptNSFWPicsOptions,
	} from "$lib/model/users/profiles";
	import ProfileField from "./ProfileField.svelte";
	import ProfileValueLabel from "./ProfileValueLabel.svelte";

	let {
		nsfwPics,
	}: {
		nsfwPics: AcceptNSFWPicsId | null;
	} = $props();
</script>

{#if nsfwPics !== null}
	<ProfileField>
		<CameraIcon class="shrink-0" />
		<ProfileValueLabel label="NSFW Pics?">
			{acceptNSFWPicsOptions[nsfwPics]}
		</ProfileValueLabel>
	</ProfileField>
{/if}
