package org.opengrind.language

import android.app.Activity
import android.app.LocaleManager
import android.content.Context
import android.content.res.Configuration
import android.content.res.Resources
import android.os.Build
import android.os.LocaleList
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject
import org.opengrind.push.PushNotifier
import org.opengrind.update.TransferService

@InvokeArg
internal class WatchArgs {
	lateinit var onChange: Channel
}

@InvokeArg
internal class LanguageArgs {
	var tag: String? = null
}

@TauriPlugin
class AppLanguagePlugin(private val activity: Activity) : Plugin(activity) {
	private val context = activity.applicationContext
	private var watcher: Channel? = null
	private var lastSent: String? = null
	private var namedFor: LocaleList = activity.resources.configuration.locales

	override fun onResume() = publish()

	override fun onConfigurationChanged(newConfig: Configuration) {
		if (newConfig.locales != namedFor) {
			namedFor = newConfig.locales
			runCatching { renameChannels(activity) }
		}
		publish()
	}

	@Command
	fun getAppLanguages(invoke: Invoke) {
		try {
			invoke.resolve(snapshot())
		} catch (e: Exception) {
			invoke.reject("read-failed")
		}
	}

	@Command
	fun setAppLanguage(invoke: Invoke) {
		if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
			invoke.reject("unsupported")
			return
		}
		val tag = try {
			invoke.parseArgs(LanguageArgs::class.java).tag
		} catch (e: Exception) {
			invoke.reject("missing")
			return
		}
		val locales = localesFor(tag)
		if (locales == null) {
			invoke.reject("invalid-tag")
			return
		}
		try {
			val manager = context.getSystemService(LocaleManager::class.java)
			manager.applicationLocales = locales
			invoke.resolve()
		} catch (e: Exception) {
			invoke.reject("set-failed")
		}
	}

	@Command
	fun setNativeLanguage(invoke: Invoke) {
		val tag = try {
			invoke.parseArgs(LanguageArgs::class.java).tag
		} catch (e: Exception) {
			invoke.reject("missing")
			return
		}
		try {
			if (!NativeLanguage.remember(context, tag)) {
				invoke.reject("set-failed")
				return
			}
			renameChannels(context)
			invoke.resolve()
		} catch (e: Exception) {
			invoke.reject("set-failed")
		}
	}

	@Command
	fun watchAppLanguages(invoke: Invoke) {
		try {
			val channel = invoke.parseArgs(WatchArgs::class.java).onChange
			synchronized(this) {
				watcher = channel
				lastSent = runCatching { snapshot().toString() }.getOrNull()
			}
			invoke.resolve()
		} catch (e: Exception) {
			invoke.reject("watch-failed")
		}
	}

	@Synchronized
	private fun publish() {
		val channel = watcher ?: return
		val languages = runCatching { snapshot() }.getOrNull() ?: return
		val key = languages.toString()
		if (key == lastSent) return
		lastSent = key
		channel.send(languages)
	}

	private fun renameChannels(source: Context) {
		PushNotifier.renameChannels(source)
		TransferService.renameChannel(source)
	}

	private fun snapshot(): JSObject = JSObject().apply {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
			val manager = context.getSystemService(LocaleManager::class.java)
			val app = manager.applicationLocales.get(0)?.toLanguageTag()
			put("tier", "two-way")
			put("app", app ?: JSONObject.NULL)
			put("system", tags(manager.systemLocales))
		} else {
			put("tier", "none")
			put("app", JSONObject.NULL)
			put("system", tags(Resources.getSystem().configuration.locales))
		}
	}

	private fun tags(locales: LocaleList): JSArray = JSArray().apply {
		for (index in 0 until locales.size()) {
			put(locales.get(index).toLanguageTag())
		}
	}

	private fun localesFor(tag: String?): LocaleList? {
		if (tag == null) return LocaleList.getEmptyLocaleList()
		return LanguageTags.localeOf(tag)?.let { LocaleList(it) }
	}
}
