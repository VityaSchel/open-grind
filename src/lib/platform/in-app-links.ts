import { isMacosPlatform } from "$lib/platform/os";
import { isProxiedMediaUrl } from "$lib/util/media";
import { isPlainClick } from "$lib/util/plain-click";

const MIDDLE_BUTTON = 1;

export function staysInApp({
	href,
	app,
}: {
	href: string;
	app: Location | URL;
}): boolean {
	let url: URL;
	try {
		url = new URL(href);
	} catch {
		return false;
	}
	return (
		(url.protocol === app.protocol && url.host === app.host) ||
		isProxiedMediaUrl(url)
	);
}

export function keepLinksInApp(): () => void {
	const listening = new AbortController();
	const onClick = (event: MouseEvent) => {
		if (event.button > MIDDLE_BUTTON || isPlainClick(event)) return;
		const link = event
			.composedPath()
			.find(
				(node): node is HTMLAnchorElement =>
					node instanceof HTMLAnchorElement && node.href !== "",
			);
		if (link === undefined) return;
		const fromKeyboard = event.detail === 0;
		const secondaryClick =
			!fromKeyboard &&
			event.button === 0 &&
			event.ctrlKey &&
			isMacosPlatform();
		if (!secondaryClick && !staysInApp({ href: link.href, app: location }))
			return;
		event.preventDefault();
		event.stopImmediatePropagation();
		if (secondaryClick) return;
		event.target?.dispatchEvent(
			new MouseEvent("click", {
				bubbles: true,
				cancelable: true,
				composed: true,
				view: event.view,
				detail: event.detail,
				clientX: event.clientX,
				clientY: event.clientY,
				screenX: event.screenX,
				screenY: event.screenY,
			}),
		);
	};
	const options = { capture: true, signal: listening.signal };
	window.addEventListener("click", onClick, options);
	window.addEventListener("auxclick", onClick, options);
	return () => listening.abort();
}
