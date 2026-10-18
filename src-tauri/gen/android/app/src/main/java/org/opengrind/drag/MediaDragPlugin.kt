package org.opengrind.drag

import android.app.Activity
import android.view.DragEvent
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
internal class WatchArgs {
    lateinit var onEvent: Channel
}

@TauriPlugin
class MediaDragPlugin(activity: Activity) : Plugin(activity) {
    private var channel: Channel? = null

    override fun load(webView: WebView) {
        webView.setOnDragListener { _, event ->
            report(event)
            false
        }
    }

    @Command
    fun watch(invoke: Invoke) {
        channel = invoke.parseArgs(WatchArgs::class.java).onEvent
        invoke.resolve()
    }

    private fun report(event: DragEvent) {
        val mimeTypes = when (event.action) {
            DragEvent.ACTION_DRAG_STARTED -> {
                val description = event.clipDescription ?: return
                (0 until description.mimeTypeCount).map(description::getMimeType)
            }
            DragEvent.ACTION_DRAG_ENDED -> emptyList()
            else -> return
        }
        channel?.send(JSObject().apply { put("mimeTypes", JSArray(mimeTypes)) })
    }
}
