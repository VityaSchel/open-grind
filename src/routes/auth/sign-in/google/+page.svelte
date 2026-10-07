<script>
	import { t } from "$lib/i18n";
	import GoogleSignInForm from "./GoogleSignInForm.svelte";
</script>

<svelte:head>
	<title>{t("auth.signIn.withGoogle")}</title>
</svelte:head>
<GoogleSignInForm />
