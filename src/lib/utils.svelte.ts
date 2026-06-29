export function proxify<T>(value: T): T {
	const proxified = $state(value);
	return proxified;
}
