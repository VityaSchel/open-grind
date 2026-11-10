<script>
	import PageTitle from "#lib/components/shared/PageTitle.svelte";
	import { t } from "#lib/i18n/index.ts";
	import GoogleSignInForm from "./GoogleSignInForm.svelte";
</script>

<PageTitle page={t("auth.signIn.google.title")} />
<GoogleSignInForm />
