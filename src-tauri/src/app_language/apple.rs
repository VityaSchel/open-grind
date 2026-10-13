use objc2::rc::{autoreleasepool, Retained};
use objc2::runtime::AnyObject;
use objc2_foundation::{
	ns_string, NSArray, NSBundle, NSGlobalDomain, NSLocale, NSString,
	NSUserDefaults,
};

use super::desktop::{AppLanguages, SyncTier};
use super::tags::is_language_tag;
use super::NO_PER_APP_SETTING;

fn languages_key() -> &'static NSString {
	ns_string!("AppleLanguages")
}

fn app_domain() -> Option<Retained<NSString>> {
	let bundle = NSBundle::mainBundle();
	let identifier = bundle.bundleIdentifier()?;
	bundle
		.bundlePath()
		.to_string()
		.ends_with(".app")
		.then_some(identifier)
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
		let defaults = NSUserDefaults::standardUserDefaults();
		let system = system_languages(&defaults);
		match app_domain() {
			Some(domain) => AppLanguages {
				tier: SyncTier::TwoWay,
				app: domain_languages(&defaults, &domain).into_iter().next(),
				system,
			},
			None => AppLanguages::unsynced(system),
		}
	})
}

pub fn write(tag: Option<&str>) -> Result<(), String> {
	autoreleasepool(|_| {
		if app_domain().is_none() {
			return Err(NO_PER_APP_SETTING.into());
		}
		let defaults = NSUserDefaults::standardUserDefaults();
		match tag {
			None => defaults.removeObjectForKey(languages_key()),
			Some(tag) if is_language_tag(tag) => {
				let languages =
					NSArray::from_retained_slice(&[NSString::from_str(tag)]);
				unsafe {
					defaults.setObject_forKey(Some(&languages), languages_key())
				};
			}
			Some(_) => return Err("invalid-tag".into()),
		}
		Ok(())
	})
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn an_unbundled_binary_reads_the_system_list_without_syncing() {
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

	#[test]
	fn an_unbundled_binary_never_writes_a_language() {
		assert_eq!(write(Some("de")), Err(NO_PER_APP_SETTING.into()));
		assert_eq!(write(None), Err(NO_PER_APP_SETTING.into()));
	}
}
