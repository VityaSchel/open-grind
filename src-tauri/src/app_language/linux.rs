use super::desktop::AppLanguages;
use super::tags::posix_languages;
use super::NO_PER_APP_SETTING;

pub fn read() -> AppLanguages {
	AppLanguages::unsynced(posix_languages(|name| std::env::var(name).ok()))
}

pub fn write(_tag: Option<&str>) -> Result<(), String> {
	Err(NO_PER_APP_SETTING.into())
}
