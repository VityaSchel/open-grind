<script>
	import { t } from "$lib/i18n";
	import SignInForm from "./SignInForm.svelte";
</script>

<svelte:head>
	<title>{t("auth.signIn.title")}</title>
</svelte:head>
<SignInForm />
