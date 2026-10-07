<script>
	import { t } from "$lib/i18n";
	import RegisterForm from "./RegisterForm.svelte";
</script>

<svelte:head>
	<title>{t("auth.signUp.title")}</title>
</svelte:head>
<RegisterForm />
