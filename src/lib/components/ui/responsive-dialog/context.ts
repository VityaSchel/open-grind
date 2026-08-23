import { getContext, hasContext, setContext } from "svelte";

const RESPONSIVE_DIALOG_CONTEXT = Symbol("RESPONSIVE_DIALOG_CONTEXT");

export type ResponsiveDialogContext = { readonly desktop: boolean };

export function setResponsiveDialogContext(
	context: ResponsiveDialogContext,
): ResponsiveDialogContext {
	setContext(RESPONSIVE_DIALOG_CONTEXT, context);
	return context;
}

export function getResponsiveDialogContext(name = "This component") {
	if (!hasContext(RESPONSIVE_DIALOG_CONTEXT)) {
		throw new Error(
			`${name} must be used within a <ResponsiveDialog.Root> component`,
		);
	}
	return getContext<ResponsiveDialogContext>(RESPONSIVE_DIALOG_CONTEXT);
}
