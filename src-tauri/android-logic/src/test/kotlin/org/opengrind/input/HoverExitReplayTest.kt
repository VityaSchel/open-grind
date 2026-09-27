package org.opengrind.input

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HoverExitReplayTest {
	private val pen = Pointer(deviceId = 7, source = 0x5002, pointerId = 0, tool = PointerTool.Stylus)
	private val eraser = pen.copy(tool = PointerTool.Eraser)
	private val mouse = Pointer(deviceId = 9, source = 0x2002, pointerId = 0, tool = PointerTool.Mouse)
	private val finger = Pointer(deviceId = 3, source = 0x1002, pointerId = 0, tool = PointerTool.Finger)

	private var touchExploration = false
	private var scheduled = false
	private val released = ArrayList<Pointer>()
	private val replay = HoverExitReplay(
		isTouchExplorationEnabled = { touchExploration },
		schedule = { scheduled = true },
		cancel = { scheduled = false },
		release = { released.add(it) },
	)

	private fun settle() {
		if (!scheduled) return
		scheduled = false
		replay.settle()
	}

	@Test
	fun `a pen exit that settles is replayed once`() {
		replay.observe(PointerAction.HoverExit, pen)

		assertTrue("the replay must wait for the exit to settle", released.isEmpty())
		settle()
		replay.settle()
		assertEquals(listOf(pen), released)
	}

	@Test
	fun `a touch after the replay does not replay it again`() {
		replay.observe(PointerAction.HoverExit, pen)
		settle()
		replay.observe(PointerAction.Down, finger)

		assertEquals(listOf(pen), released)
	}

	@Test
	fun `mouse and eraser exits are replayed like a pen exit`() {
		replay.observe(PointerAction.HoverExit, mouse)
		settle()
		replay.observe(PointerAction.HoverExit, eraser)
		settle()

		assertEquals(listOf(mouse, eraser), released)
	}

	@Test
	fun `a pen press right after its exit is never replayed`() {
		replay.observe(PointerAction.HoverExit, pen)
		replay.observe(PointerAction.Down, pen)

		assertFalse("the pending replay must be cancelled", scheduled)
		settle()
		assertTrue(released.isEmpty())
	}

	@Test
	fun `a mouse click right after its exit is never replayed`() {
		replay.observe(PointerAction.HoverExit, mouse)
		replay.observe(PointerAction.Down, mouse)
		settle()

		assertTrue(released.isEmpty())
	}

	@Test
	fun `hovering back in before the exit settles is never replayed`() {
		replay.observe(PointerAction.HoverExit, pen)
		replay.observe(PointerAction.HoverEnter, pen)
		assertFalse(scheduled)
		settle()
		replay.observe(PointerAction.HoverExit, pen)
		replay.observe(PointerAction.HoverMove, pen)
		assertFalse(scheduled)
		settle()

		assertTrue(released.isEmpty())
	}

	@Test
	fun `a finger exit never arms`() {
		replay.observe(PointerAction.HoverExit, finger)
		settle()

		assertFalse("trackpads and TalkBack hover with a finger", scheduled)
		assertTrue(released.isEmpty())
	}

	@Test
	fun `an exit from an unknown tool never arms`() {
		replay.observe(PointerAction.HoverExit, pen.copy(tool = PointerTool.Other))
		settle()

		assertFalse(scheduled)
		assertTrue(released.isEmpty())
	}

	@Test
	fun `a pen exit under touch exploration never arms`() {
		touchExploration = true
		replay.observe(PointerAction.HoverExit, pen)
		settle()

		assertFalse("TalkBack turns pen touches into hover", scheduled)
		assertTrue(released.isEmpty())
	}

	@Test
	fun `a finger touch after a pen exit replays it at once`() {
		replay.observe(PointerAction.HoverExit, pen)
		replay.observe(PointerAction.Down, finger)

		assertEquals("the replay must reach Blink before the touch does", listOf(pen), released)
		assertFalse(scheduled)
		settle()
		assertEquals(listOf(pen), released)
	}

	@Test
	fun `a press from another device replays the exit at once`() {
		replay.observe(PointerAction.HoverExit, pen)
		replay.observe(PointerAction.Down, mouse)

		assertEquals(listOf(pen), released)
		assertFalse(scheduled)
	}

	@Test
	fun `a finger touch on the pen's own digitizer replays the exit at once`() {
		replay.observe(PointerAction.HoverExit, pen)
		replay.observe(PointerAction.Down, finger.copy(deviceId = pen.deviceId))

		assertEquals(listOf(pen), released)
	}

	@Test
	fun `repeated exits are replayed once`() {
		repeat(3) { replay.observe(PointerAction.HoverExit, pen) }
		settle()

		assertEquals(listOf(pen), released)
	}

	@Test
	fun `an exit from another device replays the pending one at once`() {
		replay.observe(PointerAction.HoverExit, pen)
		replay.observe(PointerAction.HoverExit, mouse)

		assertEquals(listOf(pen), released)
		settle()
		assertEquals(listOf(pen, mouse), released)
	}

	@Test
	fun `another device hovering keeps the pending exit`() {
		replay.observe(PointerAction.HoverExit, pen)
		replay.observe(PointerAction.HoverEnter, mouse)
		replay.observe(PointerAction.HoverMove, mouse)
		settle()

		assertEquals(listOf(pen), released)
	}

	@Test
	fun `a touch with no pending exit replays nothing`() {
		replay.observe(PointerAction.Down, finger)
		replay.observe(PointerAction.Down, pen)

		assertTrue(released.isEmpty())
		assertFalse(scheduled)
	}
}
