package org.opengrind

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.MotionEvent
import android.view.accessibility.AccessibilityManager
import android.webkit.WebView
import org.opengrind.input.HoverExitReplay
import org.opengrind.input.Pointer
import org.opengrind.input.PointerAction
import org.opengrind.input.PointerTool

class WebViewHoverRepair(
	private val context: Context,
	private val webView: () -> WebView?,
) {
	private val handler = Handler(Looper.getMainLooper())
	private val replay: HoverExitReplay = HoverExitReplay(
		isTouchExplorationEnabled = {
			context.getSystemService(AccessibilityManager::class.java)?.isTouchExplorationEnabled == true
		},
		schedule = { handler.postDelayed(settle, SETTLE_MS) },
		cancel = { handler.removeCallbacks(settle) },
		release = ::hoverOffPage,
	)
	private val settle = Runnable { replay.settle() }

	fun observe(event: MotionEvent) {
		val action = actionOf(event.actionMasked) ?: return
		replay.observe(
			action = action,
			pointer = Pointer(
				deviceId = event.deviceId,
				source = event.source,
				pointerId = event.getPointerId(0),
				tool = toolOf(event.getToolType(0)),
			),
		)
	}

	// Chromium ignores hover exits, so :hover sticks after the pen lifts. https://crbug.com/715114
	private fun hoverOffPage(exit: Pointer) {
		val view = webView()?.takeIf { it.isAttachedToWindow } ?: return
		val now = SystemClock.uptimeMillis()
		val properties = MotionEvent.PointerProperties().apply {
			id = exit.pointerId
			toolType = toolTypeOf(exit.tool)
		}
		val coords = MotionEvent.PointerCoords().apply {
			x = -1f
			y = -1f
		}
		val event = MotionEvent.obtain(
			now, now, MotionEvent.ACTION_HOVER_MOVE,
			1, arrayOf(properties), arrayOf(coords),
			0, 0, 1f, 1f,
			exit.deviceId, 0, exit.source, 0,
		)
		try {
			view.onHoverEvent(event)
		} finally {
			event.recycle()
		}
	}

	private companion object {
		const val SETTLE_MS = 50L

		fun actionOf(actionMasked: Int) = when (actionMasked) {
			MotionEvent.ACTION_HOVER_ENTER -> PointerAction.HoverEnter
			MotionEvent.ACTION_HOVER_MOVE -> PointerAction.HoverMove
			MotionEvent.ACTION_HOVER_EXIT -> PointerAction.HoverExit
			MotionEvent.ACTION_DOWN -> PointerAction.Down
			else -> null
		}

		fun toolOf(toolType: Int) = when (toolType) {
			MotionEvent.TOOL_TYPE_FINGER -> PointerTool.Finger
			MotionEvent.TOOL_TYPE_STYLUS -> PointerTool.Stylus
			MotionEvent.TOOL_TYPE_ERASER -> PointerTool.Eraser
			MotionEvent.TOOL_TYPE_MOUSE -> PointerTool.Mouse
			else -> PointerTool.Other
		}

		fun toolTypeOf(tool: PointerTool) = when (tool) {
			PointerTool.Finger -> MotionEvent.TOOL_TYPE_FINGER
			PointerTool.Stylus -> MotionEvent.TOOL_TYPE_STYLUS
			PointerTool.Eraser -> MotionEvent.TOOL_TYPE_ERASER
			PointerTool.Mouse -> MotionEvent.TOOL_TYPE_MOUSE
			PointerTool.Other -> MotionEvent.TOOL_TYPE_UNKNOWN
		}
	}
}
