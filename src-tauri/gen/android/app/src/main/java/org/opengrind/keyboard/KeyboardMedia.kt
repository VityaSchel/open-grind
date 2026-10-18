package org.opengrind.keyboard

import android.content.Context
import android.net.Uri
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import androidx.core.view.ContentInfoCompat
import androidx.core.view.ViewCompat
import androidx.core.view.inputmethod.EditorInfoCompat
import androidx.core.view.inputmethod.InputConnectionCompat
import app.tauri.plugin.Channel
import app.tauri.plugin.JSObject
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.lang.ref.Reference
import java.util.UUID
import java.util.concurrent.Executors

object KeyboardMedia {
    private val MIME_TYPES = arrayOf("image/png", "image/webp", "image/jpeg", "image/gif")
    private const val MAX_BYTES = 64L * 1024 * 1024

    private class Target(val directory: File, val channel: Channel)

    private val copier = Executors.newSingleThreadExecutor()
    private var target: Target? = null

    @Synchronized
    fun listen(directory: File, channel: Channel) {
        target = Target(directory, channel)
    }

    @Synchronized
    private fun currentTarget(): Target? = target

    fun wrap(view: View, outAttrs: EditorInfo, connection: InputConnection?): InputConnection? {
        if (connection == null) return null
        EditorInfoCompat.setContentMimeTypes(outAttrs, MIME_TYPES)
        ViewCompat.setOnReceiveContentListener(view, MIME_TYPES) { _, payload ->
            receive(view.context, payload)
        }
        return InputConnectionCompat.createWrapper(view, connection, outAttrs)
    }

    private fun receive(context: Context, payload: ContentInfoCompat): ContentInfoCompat? {
        if (payload.source != ContentInfoCompat.SOURCE_INPUT_METHOD) return payload
        val target = currentTarget() ?: return payload
        val split = payload.partition { item -> item.uri != null }
        val content = split.first ?: return split.second
        copier.execute {
            val clip = content.clip
            val mimeType = clip.description.getMimeType(0)
            for (index in 0 until clip.itemCount) {
                stage(context, target, clip.getItemAt(index).uri, mimeType)
            }
            Reference.reachabilityFence(content)
        }
        return split.second
    }

    private fun stage(context: Context, target: Target, uri: Uri, mimeType: String?) {
        val id = UUID.randomUUID().toString()
        val file = File(target.directory, id)
        val staged = try {
            target.directory.mkdirs()
            val source = context.contentResolver.openInputStream(uri)
                ?: throw IOException("The keyboard sent nothing to read")
            source.use { input -> file.outputStream().use { output -> copyAtMost(input, output) } }
            true
        } catch (_: Exception) {
            file.delete()
            false
        }
        target.channel.send(
            JSObject().apply {
                put("id", if (staged) id else null)
                put("mimeType", mimeType)
            }
        )
    }

    private fun copyAtMost(input: InputStream, output: OutputStream) {
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        var copied = 0L
        while (true) {
            val read = input.read(buffer)
            if (read < 0) return
            copied += read
            if (copied > MAX_BYTES) throw IOException("The keyboard sent too much")
            output.write(buffer, 0, read)
        }
    }
}
