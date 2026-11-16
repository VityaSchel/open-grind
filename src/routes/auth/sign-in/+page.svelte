<script>
	import PageTitle from "#lib/components/shared/PageTitle.svelte";
	import { t } from "#lib/i18n/index.ts";
	import SignInForm from "./SignInForm.svelte";
</script>

<PageTitle page={t("auth.signIn.title")} />
<SignInForm />
