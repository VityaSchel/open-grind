<script>
	import { t } from "$lib/i18n";
	import GoogleSignInForm from "./GoogleSignInForm.svelte";
</script>

<svelte:head>
	<title>{t("auth.signIn.google.title")}</title>
</svelte:head>
<GoogleSignInForm />
