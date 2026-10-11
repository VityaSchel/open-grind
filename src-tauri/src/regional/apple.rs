use std::ptr::NonNull;

use block2::RcBlock;
use objc2::rc::{autoreleasepool, Retained};
use objc2::runtime::NSObjectProtocol;
use objc2::sel;
use objc2_foundation::{
	NSCalendar, NSCurrentLocaleDidChangeNotification, NSDateFormatter,
	NSDateFormatterStyle, NSDictionary, NSLocale, NSLocaleMeasurementSystem,
	NSNotification, NSNotificationCenter, NSOperationQueue, NSString,
};
use tauri::AppHandle;

use super::desktop::{refresh, MeasurementSystem, RegionalSettings};
use super::pattern;

fn component(
	components: &NSDictionary<NSString, NSString>,
	key: &str,
) -> Option<String> {
	components
		.objectForKey(&NSString::from_str(key))
		.map(|value| value.to_string())
}

fn region(
	locale: &NSLocale,
	components: &NSDictionary<NSString, NSString>,
) -> Option<String> {
	let current = locale
		.respondsToSelector(sel!(regionCode))
		.then(|| locale.regionCode())
		.flatten();
	#[allow(deprecated)]
	let country = || locale.countryCode().map(|code| code.to_string());
	current.map(|code| code.to_string()).or_else(|| {
		component(components, "rg")
			.and_then(|subdivision| subdivision.get(..2).map(str::to_uppercase))
			.or_else(country)
	})
}

fn language_tag(
	locale: &NSLocale,
	components: &NSDictionary<NSString, NSString>,
) -> String {
	[
		Some(locale.languageCode().to_string()),
		locale.scriptCode().map(|code| code.to_string()),
		region(locale, components),
	]
	.into_iter()
	.flatten()
	.collect::<Vec<_>>()
	.join("-")
}

fn formatter_pattern(
	locale: &NSLocale,
	style: impl FnOnce(&NSDateFormatter),
) -> String {
	let formatter = NSDateFormatter::new();
	formatter.setLocale(Some(locale));
	style(&formatter);
	formatter.dateFormat().to_string()
}

fn measurement_system(locale: &NSLocale) -> Option<MeasurementSystem> {
	let name = locale
		.objectForKey(unsafe { NSLocaleMeasurementSystem })?
		.downcast::<NSString>()
		.ok()?;
	pattern::apple_measurement_system(&name.to_string())
}

fn read_current() -> RegionalSettings {
	let locale: Retained<NSLocale> = NSLocale::currentLocale();
	let components =
		NSLocale::componentsFromLocaleIdentifier(&locale.localeIdentifier());
	let hours = NSDateFormatter::dateFormatFromTemplate_options_locale(
		&NSString::from_str("j"),
		0,
		Some(&locale),
	);
	let short_time = formatter_pattern(&locale, |formatter| {
		formatter.setTimeStyle(NSDateFormatterStyle::ShortStyle)
	});
	let short_date = formatter_pattern(&locale, |formatter| {
		formatter.setDateStyle(NSDateFormatterStyle::ShortStyle)
	});
	RegionalSettings {
		locale: language_tag(&locale, &components),
		number_locale: None,
		hour_cycle: hours
			.and_then(|template| pattern::hour_cycle(&template.to_string())),
		two_digit_hour: pattern::two_digit_hour(&short_time),
		date_order: pattern::date_order(&short_date),
		decimal_separator: Some(locale.decimalSeparator().to_string()),
		group_separator: Some(locale.groupingSeparator().to_string()),
		numbering_system: component(&components, "numbers"),
		first_day_of_week: pattern::sunday_first_weekday(
			NSCalendar::autoupdatingCurrentCalendar().firstWeekday(),
		),
		measurement_system: measurement_system(&locale),
	}
}

pub async fn read() -> RegionalSettings {
	autoreleasepool(|_| read_current())
}

pub fn observe(app: AppHandle) {
	let on_change =
		RcBlock::new(move |_: NonNull<NSNotification>| refresh(&app));
	let _registration = unsafe {
		NSNotificationCenter::defaultCenter()
			.addObserverForName_object_queue_usingBlock(
				Some(NSCurrentLocaleDidChangeNotification),
				None,
				Some(&NSOperationQueue::mainQueue()),
				&on_change,
			)
	};
}
