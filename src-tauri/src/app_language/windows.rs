use windows::core::PWSTR;
use windows::System::UserProfile::GlobalizationPreferences;
use windows::Win32::Globalization::{
	GetUserPreferredUILanguages, MUI_LANGUAGE_NAME,
};

use super::desktop::AppLanguages;
use super::tags::multi_string;
use super::NO_PER_APP_SETTING;

fn preferred_languages() -> Option<Vec<String>> {
	let languages = GlobalizationPreferences::Languages().ok()?;
	let tags: Vec<String> = (0..languages.Size().ok()?)
		.filter_map(|index| languages.GetAt(index).ok())
		.map(|tag| tag.to_string_lossy())
		.filter(|tag| !tag.is_empty())
		.collect();
	(!tags.is_empty()).then_some(tags)
}

fn preferred_ui_languages() -> Option<Vec<u16>> {
	let mut count = 0u32;
	let mut length = 0u32;
	unsafe {
		GetUserPreferredUILanguages(
			MUI_LANGUAGE_NAME,
			&mut count,
			None,
			&mut length,
		)
	}
	.ok()?;
	let mut buffer = vec![0u16; usize::try_from(length).ok()?];
	unsafe {
		GetUserPreferredUILanguages(
			MUI_LANGUAGE_NAME,
			&mut count,
			Some(PWSTR(buffer.as_mut_ptr())),
			&mut length,
		)
	}
	.ok()?;
	buffer.truncate(usize::try_from(length).ok()?);
	Some(buffer)
}

pub fn read() -> AppLanguages {
	AppLanguages::unsynced(
		preferred_languages()
			.or_else(|| {
				preferred_ui_languages().map(|buffer| multi_string(&buffer))
			})
			.unwrap_or_default(),
	)
}

pub fn write(_tag: Option<&str>) -> Result<(), String> {
	Err(NO_PER_APP_SETTING.into())
}
