import { setCountFormatter } from "../index";

export function restoreCountFormatter(): void {
	setCountFormatter(({ count }) => String(count));
}
