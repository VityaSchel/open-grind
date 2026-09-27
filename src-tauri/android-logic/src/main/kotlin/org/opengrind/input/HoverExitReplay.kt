package org.opengrind.input

enum class PointerTool {
	Finger,
	Stylus,
	Eraser,
	Mouse,
	Other,
	;

	val hovers: Boolean
		get() = this == Stylus || this == Eraser || this == Mouse
}

enum class PointerAction {
	HoverEnter,
	HoverMove,
	HoverExit,
	Down,
}

data class Pointer(
	val deviceId: Int,
	val source: Int,
	val pointerId: Int,
	val tool: PointerTool,
)

class HoverExitReplay(
	private val isTouchExplorationEnabled: () -> Boolean,
	private val schedule: () -> Unit,
	private val cancel: () -> Unit,
	private val release: (Pointer) -> Unit,
) {
	private var pendingExit: Pointer? = null

	fun observe(action: PointerAction, pointer: Pointer) = when (action) {
		PointerAction.HoverExit -> arm(pointer)
		PointerAction.HoverEnter, PointerAction.HoverMove -> onHover(pointer)
		PointerAction.Down -> onDown(pointer)
	}

	fun settle() {
		val exit = pendingExit ?: return
		pendingExit = null
		release(exit)
	}

	private fun disarm() {
		if (pendingExit == null) return
		pendingExit = null
		cancel()
	}

	private fun releaseAtOnce() {
		if (pendingExit == null) return
		cancel()
		settle()
	}

	private fun arm(exit: Pointer) {
		if (!exit.tool.hovers || isTouchExplorationEnabled()) return
		if (pendingExit?.deviceId == exit.deviceId) disarm() else releaseAtOnce()
		pendingExit = exit
		schedule()
	}

	private fun onHover(hover: Pointer) {
		if (pendingExit?.deviceId == hover.deviceId) disarm()
	}

	private fun onDown(down: Pointer) {
		val exit = pendingExit ?: return
		val hoveringToolPressed = down.deviceId == exit.deviceId && down.tool != PointerTool.Finger
		if (hoveringToolPressed) disarm() else releaseAtOnce()
	}
}
