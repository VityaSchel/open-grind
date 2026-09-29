class MediaRetry {
	generation = $state(0);

	nudge(): void {
		this.generation++;
	}
}

export const mediaRetry = new MediaRetry();
