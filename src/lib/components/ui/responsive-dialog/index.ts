import Body from "./responsive-dialog-body.svelte";
import Content from "./responsive-dialog-content.svelte";
import Description from "./responsive-dialog-description.svelte";
import Footer from "./responsive-dialog-footer.svelte";
import Header from "./responsive-dialog-header.svelte";
import Title from "./responsive-dialog-title.svelte";
import Root from "./responsive-dialog.svelte";

export { getResponsiveDialogContext } from "./context.js";
export {
	Root,
	Content,
	Body,
	Description,
	Footer,
	Header,
	Title,
	//
	Root as ResponsiveDialog,
	Content as ResponsiveDialogContent,
	Body as ResponsiveDialogBody,
	Description as ResponsiveDialogDescription,
	Footer as ResponsiveDialogFooter,
	Header as ResponsiveDialogHeader,
	Title as ResponsiveDialogTitle,
};
