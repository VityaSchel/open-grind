import DefaultTheme from "vitepress/theme";
import "virtual:icons.css";
import "./custom.css";
import Layout from "./Layout.vue";
import Subpages from "./Subpages.vue";

export default {
	extends: DefaultTheme,
	Layout,
	enhanceApp({ app }) {
		app.component("Subpages", Subpages);
	},
};
