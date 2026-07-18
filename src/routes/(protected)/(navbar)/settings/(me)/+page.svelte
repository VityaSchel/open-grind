<script lang="ts">
	import { version } from "$app/environment";

	import AccountSettingsLink from "./AccountSettingsLink.svelte";
	import AppSettingsLink from "./AppSettingsLink.svelte";
	import ProfileLink from "./ProfileLink.svelte";
	import SignOutButton from "./SignOutButton.svelte";
	import Socials from "./Socials.svelte";

	const { data }: import("./$types").PageProps = $props();
</script>

<main class="screen-nav-host">
	<div class="h-full w-full overflow-y-auto overscroll-none">
		<div class="flex w-full p-4 pb-nav-clear">
			<div class="m-auto flex w-full max-w-120 flex-col gap-3 pb-16">
				<ProfileLink id={data.ourProfileId} />
				<span role="separator"></span>
				<AccountSettingsLink />
				<AppSettingsLink />
				<SignOutButton />
				<span role="separator"></span>
				<Socials />
				<span
					class="px-4 py-2 font-mono text-xs break-all whitespace-pre-wrap text-muted-foreground select-text"
				>
					{version}
				</span>
			</div>
		</div>
	</div>
</main>
