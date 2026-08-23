export type Tab = "media" | "albums" | "location";

export type TabSelection = { count: number; label: string };

export type SelectionTab = { submitSelection: () => void };
