export function hostAssetSuffix(): string {
	const arch = process.arch === "arm64" ? "arm64" : "x86_64";
	return (
		{
			darwin: `-macos-${arch}.zip`,
			linux: `-linux-${arch}.deb`,
			win32: `-windows-${arch}.exe`,
		}[process.platform as string] ?? "-android.apk"
	);
}
