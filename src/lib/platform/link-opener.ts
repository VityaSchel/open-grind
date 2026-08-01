export function openExternalLink(url: string) {
	const urlObj = new URL(url);
	if (["https:", "http:"].includes(urlObj.protocol)) {
		void import("@tauri-apps/plugin-opener").then(({ openUrl }) =>
			openUrl(urlObj.href),
		);
	} else {
		console.error(
			`Blocked navigation to URL with unsupported scheme: ${urlObj.protocol}`,
		);
	}
}
