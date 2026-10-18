export type Enqueue = <T>(task: () => Promise<T>) => Promise<T>;

export function createSerialQueue(): Enqueue {
	let last: Promise<unknown> = Promise.resolve();
	return (task) => {
		const turn = last.then(task, task);
		last = turn.catch(() => undefined);
		return turn;
	};
}
