package org.opengrind.disguise

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.annotation.DrawableRes

object Disguise {
	const val ORIGINAL = "original"
	private const val META_ID = "org.opengrind.disguise"
	private const val META_NOTIFICATION_ICON = "org.opengrind.disguise.notification_icon"
	private const val EXTRA_PREFER_SMALL_ICON = "android.app.preferSmallIcon"

	data class Alias(
		val id: String,
		val component: ComponentName,
		@DrawableRes val notificationIcon: Int,
		val enabledByDefault: Boolean,
	)

	fun aliases(context: Context): List<Alias> {
		val flags = PackageManager.GET_ACTIVITIES or
			PackageManager.GET_META_DATA or
			PackageManager.MATCH_DISABLED_COMPONENTS
		val packageManager = context.packageManager
		val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
			packageManager.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(flags.toLong()))
		} else {
			@Suppress("DEPRECATION")
			packageManager.getPackageInfo(context.packageName, flags)
		}
		return info.activities.orEmpty().mapNotNull { activity ->
			val metaData = activity.metaData ?: return@mapNotNull null
			val id = metaData.getString(META_ID) ?: return@mapNotNull null
			Alias(
				id = id,
				component = ComponentName(context.packageName, activity.name),
				notificationIcon = metaData.getInt(META_NOTIFICATION_ICON),
				enabledByDefault = activity.enabled,
			)
		}
	}

	fun current(context: Context): Alias {
		val all = aliases(context)
		return all.firstOrNull { isEnabled(context, it) } ?: all.first { it.id == ORIGINAL }
	}

	fun select(context: Context, id: String) {
		val all = aliases(context)
		val target = all.firstOrNull { it.id == id } ?: throw IllegalArgumentException("unknown disguise $id")
		setEnabled(context, target, enabled = true)
		for (alias in all) if (alias != target) setEnabled(context, alias, enabled = false)
	}

	fun ensureLauncherEntry(context: Context) {
		if (aliases(context).none { isEnabled(context, it) }) select(context, ORIGINAL)
	}

	fun launchIntent(context: Context): Intent =
		Intent(Intent.ACTION_MAIN)
			.addCategory(Intent.CATEGORY_LAUNCHER)
			.setComponent(current(context).component)

	fun notificationExtras(context: Context): Bundle = Bundle().apply {
		if (current(context).id != ORIGINAL) putBoolean(EXTRA_PREFER_SMALL_ICON, true)
	}

	private fun isEnabled(context: Context, alias: Alias) =
		when (context.packageManager.getComponentEnabledSetting(alias.component)) {
			PackageManager.COMPONENT_ENABLED_STATE_ENABLED -> true
			PackageManager.COMPONENT_ENABLED_STATE_DEFAULT -> alias.enabledByDefault
			else -> false
		}

	private fun setEnabled(context: Context, alias: Alias, enabled: Boolean) {
		val state = when {
			enabled == alias.enabledByDefault -> PackageManager.COMPONENT_ENABLED_STATE_DEFAULT
			enabled -> PackageManager.COMPONENT_ENABLED_STATE_ENABLED
			else -> PackageManager.COMPONENT_ENABLED_STATE_DISABLED
		}
		if (context.packageManager.getComponentEnabledSetting(alias.component) == state) return
		context.packageManager.setComponentEnabledSetting(alias.component, state, PackageManager.DONT_KILL_APP)
	}
}
