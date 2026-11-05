#[cfg(target_os = "linux")]
pub(super) const ICONS: &[(&str, &[u8])] = &[
	(
		"open-back-door",
		include_bytes!("icons/linux/open-back-door.png"),
	),
	("navigaitor", include_bytes!("icons/linux/navigaitor.png")),
	("papizza", include_bytes!("icons/linux/papizza.png")),
	("hook-app", include_bytes!("icons/linux/hook-app.png")),
	("bus-sy", include_bytes!("icons/linux/bus-sy.png")),
	(
		"food-amarelo",
		include_bytes!("icons/linux/food-amarelo.png"),
	),
	("kvirchat", include_bytes!("icons/linux/kvirchat.png")),
	("vibrogym", include_bytes!("icons/linux/vibrogym.png")),
	("taps24", include_bytes!("icons/linux/taps24.png")),
	(
		"sosim-settings",
		include_bytes!("icons/linux/sosim-settings.png"),
	),
	("cogsoccer", include_bytes!("icons/linux/cogsoccer.png")),
	("cornball", include_bytes!("icons/linux/cornball.png")),
	("twinkies", include_bytes!("icons/linux/twinkies.png")),
	(
		"peaches-online",
		include_bytes!("icons/linux/peaches-online.png"),
	),
	("myeggplants", include_bytes!("icons/linux/myeggplants.png")),
	(
		"picdictionary",
		include_bytes!("icons/linux/picdictionary.png"),
	),
	("hayman", include_bytes!("icons/linux/hayman.png")),
	("pasact", include_bytes!("icons/linux/pasact.png")),
	("blow-today", include_bytes!("icons/linux/blow-today.png")),
	("greener", include_bytes!("icons/linux/greener.png")),
	("catfishers", include_bytes!("icons/linux/catfishers.png")),
	("bible", include_bytes!("icons/linux/bible.png")),
	(
		"ultra-calculator",
		include_bytes!("icons/linux/ultra-calculator.png"),
	),
	("grindle", include_bytes!("icons/linux/grindle.png")),
];

#[cfg(target_os = "macos")]
pub(super) const ICONS: &[(&str, &[u8])] = &[
	(
		"open-back-door",
		include_bytes!("icons/macos/open-back-door.png"),
	),
	("navigaitor", include_bytes!("icons/macos/navigaitor.png")),
	("papizza", include_bytes!("icons/macos/papizza.png")),
	("hook-app", include_bytes!("icons/macos/hook-app.png")),
	("bus-sy", include_bytes!("icons/macos/bus-sy.png")),
	(
		"food-amarelo",
		include_bytes!("icons/macos/food-amarelo.png"),
	),
	("kvirchat", include_bytes!("icons/macos/kvirchat.png")),
	("vibrogym", include_bytes!("icons/macos/vibrogym.png")),
	("taps24", include_bytes!("icons/macos/taps24.png")),
	(
		"sosim-settings",
		include_bytes!("icons/macos/sosim-settings.png"),
	),
	("cogsoccer", include_bytes!("icons/macos/cogsoccer.png")),
	("cornball", include_bytes!("icons/macos/cornball.png")),
	("twinkies", include_bytes!("icons/macos/twinkies.png")),
	(
		"peaches-online",
		include_bytes!("icons/macos/peaches-online.png"),
	),
	("myeggplants", include_bytes!("icons/macos/myeggplants.png")),
	(
		"picdictionary",
		include_bytes!("icons/macos/picdictionary.png"),
	),
	("hayman", include_bytes!("icons/macos/hayman.png")),
	("pasact", include_bytes!("icons/macos/pasact.png")),
	("blow-today", include_bytes!("icons/macos/blow-today.png")),
	("greener", include_bytes!("icons/macos/greener.png")),
	("catfishers", include_bytes!("icons/macos/catfishers.png")),
	("bible", include_bytes!("icons/macos/bible.png")),
	(
		"ultra-calculator",
		include_bytes!("icons/macos/ultra-calculator.png"),
	),
	("grindle", include_bytes!("icons/macos/grindle.png")),
];

#[cfg(target_os = "windows")]
pub(super) const ICONS: &[(&str, &[u8])] = &[
	(
		"open-back-door",
		include_bytes!("icons/windows/open-back-door.ico"),
	),
	("navigaitor", include_bytes!("icons/windows/navigaitor.ico")),
	("papizza", include_bytes!("icons/windows/papizza.ico")),
	("hook-app", include_bytes!("icons/windows/hook-app.ico")),
	("bus-sy", include_bytes!("icons/windows/bus-sy.ico")),
	(
		"food-amarelo",
		include_bytes!("icons/windows/food-amarelo.ico"),
	),
	("kvirchat", include_bytes!("icons/windows/kvirchat.ico")),
	("vibrogym", include_bytes!("icons/windows/vibrogym.ico")),
	("taps24", include_bytes!("icons/windows/taps24.ico")),
	(
		"sosim-settings",
		include_bytes!("icons/windows/sosim-settings.ico"),
	),
	("cogsoccer", include_bytes!("icons/windows/cogsoccer.ico")),
	("cornball", include_bytes!("icons/windows/cornball.ico")),
	("twinkies", include_bytes!("icons/windows/twinkies.ico")),
	(
		"peaches-online",
		include_bytes!("icons/windows/peaches-online.ico"),
	),
	(
		"myeggplants",
		include_bytes!("icons/windows/myeggplants.ico"),
	),
	(
		"picdictionary",
		include_bytes!("icons/windows/picdictionary.ico"),
	),
	("hayman", include_bytes!("icons/windows/hayman.ico")),
	("pasact", include_bytes!("icons/windows/pasact.ico")),
	("blow-today", include_bytes!("icons/windows/blow-today.ico")),
	("greener", include_bytes!("icons/windows/greener.ico")),
	("catfishers", include_bytes!("icons/windows/catfishers.ico")),
	("bible", include_bytes!("icons/windows/bible.ico")),
	(
		"ultra-calculator",
		include_bytes!("icons/windows/ultra-calculator.ico"),
	),
	("grindle", include_bytes!("icons/windows/grindle.ico")),
];
