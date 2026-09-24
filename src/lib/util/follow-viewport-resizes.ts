export function followViewportResizes({
	settleMs,
	onFrame,
}: {
	settleMs: number;
	onFrame: () => void;
}): () => void {
	let followUntil = 0;
	let frame = 0;

	const follow = () => {
		onFrame();
		frame =
			performance.now() < followUntil ? requestAnimationFrame(follow) : 0;
	};

	const onResize = () => {
		followUntil = performance.now() + settleMs;
		if (!frame) follow();
	};

	window.addEventListener("resize", onResize);
	return () => {
		cancelAnimationFrame(frame);
		window.removeEventListener("resize", onResize);
	};
}
