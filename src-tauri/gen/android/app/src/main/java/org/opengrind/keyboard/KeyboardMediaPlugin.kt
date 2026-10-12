package org.opengrind.keyboard

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
internal class WatchArgs {
    lateinit var directory: String
    lateinit var onEvent: Channel
}

@TauriPlugin
class KeyboardMediaPlugin(activity: Activity) : Plugin(activity) {

    @Command
    fun watch(invoke: Invoke) {
        val args = invoke.parseArgs(WatchArgs::class.java)
        KeyboardMedia.listen(File(args.directory), args.onEvent)
        invoke.resolve()
    }
}
