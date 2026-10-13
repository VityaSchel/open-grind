use objc2::rc::{autoreleasepool, Retained};
use objc2::runtime::AnyObject;
use objc2_foundation::{
	ns_string, NSArray, NSGlobalDomain, NSLocale, NSString, NSUserDefaults,
};

use super::desktop::AppLanguages;
use super::NO_PER_APP_SETTING;

fn languages_key() -> &'static NSString {
	ns_string!("AppleLanguages")
}

fn strings(value: Retained<AnyObject>) -> Vec<String> {
	value
		.downcast::<NSArray>()
		.map(|array| {
			array
				.iter()
				.filter_map(|item| item.downcast::<NSString>().ok())
				.map(|item| item.to_string())
				.collect()
		})
		.unwrap_or_default()
}

fn domain_languages(
	defaults: &NSUserDefaults,
	domain: &NSString,
) -> Vec<String> {
	defaults
		.persistentDomainForName(domain)
		.and_then(|values| values.objectForKey(languages_key()))
		.map(strings)
		.unwrap_or_default()
}

fn system_languages(defaults: &NSUserDefaults) -> Vec<String> {
	let global = domain_languages(defaults, unsafe { NSGlobalDomain });
	if !global.is_empty() {
		return global;
	}
	NSLocale::preferredLanguages()
		.iter()
		.map(|language| language.to_string())
		.collect()
}

pub fn read() -> AppLanguages {
	autoreleasepool(|_| {
		AppLanguages::unsynced(system_languages(
			&NSUserDefaults::standardUserDefaults(),
		))
	})
}

pub fn write(_tag: Option<&str>) -> Result<(), String> {
	Err(NO_PER_APP_SETTING.into())
}

#[cfg(test)]
mod tests {
	use super::super::desktop::SyncTier;
	use super::*;

	#[test]
	fn reads_the_system_list_without_syncing() {
		let languages = read();
		assert_eq!(languages.tier, SyncTier::None);
		assert_eq!(languages.app, None);
		assert!(
			!languages.system.is_empty(),
			"neither the global AppleLanguages nor NSLocale named a language"
		);
	}

	#[test]
	fn only_the_strings_of_an_array_count_as_languages() {
		let nested: Retained<AnyObject> =
			NSArray::from_retained_slice(&[NSString::from_str("fr")]).into();
		let mixed = NSArray::<AnyObject>::from_retained_slice(&[
			NSString::from_str("de-AT").into(),
			nested,
			NSString::from_str("en").into(),
		]);
		assert_eq!(strings(mixed.into()), ["de-AT", "en"]);
		assert!(strings(NSString::from_str("de").into()).is_empty());
	}
}
