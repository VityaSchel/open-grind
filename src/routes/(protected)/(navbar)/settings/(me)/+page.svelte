<script lang="ts">
	import { version } from "$app/environment";

	import AccountSettingsLink from "./AccountSettingsLink.svelte";
	import AppSettingsLink from "./AppSettingsLink.svelte";
	import ProfileLink from "./ProfileLink.svelte";
	import SignOutButton from "./SignOutButton.svelte";
	import Socials from "./Socials.svelte";

	const { data }: import("./$types").PageProps = $props();
</script>

<main class="relative h-(--screen-nav) w-full -mb-(--content-pb)">
	<div class="h-full w-full overflow-y-auto overscroll-none">
		<div class="flex w-full p-4 pb-nav-clear">
			<div class="max-w-120 w-full flex flex-col m-auto gap-3">
				<ProfileLink id={data.ourProfileId} />
				<span role="separator"></span>
				<AccountSettingsLink />
				<AppSettingsLink />
				<SignOutButton />
				<span role="separator"></span>
				<Socials />
				<span
					class="font-mono text-xs text-muted-foreground break-all whitespace-pre-wrap py-2 px-4 select-text"
				>
					{version}
				</span>
			</div>
		</div>
	</div>
</main>
