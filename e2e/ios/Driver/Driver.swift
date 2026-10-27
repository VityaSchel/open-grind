import UIKit
import XCTest

final class Driver: XCTestCase {
	private let timeout: TimeInterval = 15
	private let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")

	override class func setUp() {
		super.setUp()
		skipIdleWait()
	}

	private static func skipIdleWait() {
		guard let process = NSClassFromString("XCUIApplicationProcess") else { return }
		let oneFlag: @convention(block) (AnyObject, Bool) -> Void = { _, _ in }
		let twoFlags: @convention(block) (AnyObject, Bool, Bool) -> Void = { _, _, _ in }
		let replacements: [(String, Any)] = [
			("waitForQuiescenceIncludingAnimationsIdle:", oneFlag),
			("waitForQuiescenceIncludingAnimationsIdle:isPreEvent:", twoFlags),
		]
		for (name, block) in replacements {
			if let method = class_getInstanceMethod(process, NSSelectorFromString(name)) {
				method_setImplementation(method, imp_implementationWithBlock(block))
			}
		}
	}

	func testSteps() throws {
		let stepsPath = try XCTUnwrap(ProcessInfo.processInfo.environment["OG_STEPS"], "OG_STEPS is not set")
		let data = try Data(contentsOf: URL(fileURLWithPath: stepsPath))
		let steps = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [[String: Any]])
		let app = XCUIApplication(bundleIdentifier: "org.opengrind.app")

		for (index, step) in steps.enumerated() {
			try XCTContext.runActivity(named: "step \(index + 1): \(step)") { _ in
				try run(step, in: app)
			}
		}
	}

	private func run(_ step: [String: Any], in app: XCUIApplication) throws {
		if step["launch"] != nil {
			app.launch()
		}
		if step["activate"] != nil {
			app.activate()
		}
		if step["home"] != nil {
			XCUIDevice.shared.press(.home)
		}
		if let name = step["rotate"] as? String {
			XCUIDevice.shared.orientation = try orientation(name)
		}
		if let path = step["pasteboardImage"] as? String {
			UIPasteboard.general.image = try XCTUnwrap(UIImage(contentsOfFile: path), "no image at \(path)")
			XCTAssertTrue(UIPasteboard.general.hasImages, "pasteboard holds no image")
		}
		if let path = step["pasteboardText"] as? String {
			UIPasteboard.general.string = try String(contentsOfFile: path, encoding: .utf8)
			XCTAssertTrue(UIPasteboard.general.hasStrings, "pasteboard holds no text")
		}
		if let label = step["tap"] as? String {
			try element(label, in: app).tap()
		}
		if let label = step["tapSecure"] as? String {
			try first(label, in: app.secureTextFields).tap()
		}
		if let label = step["tapIfPresent"] as? String {
			let match = app.descendants(matching: .any).matching(labelled(label)).firstMatch
			if match.waitForExistence(timeout: 3) {
				match.tap()
			}
		}
		if let label = step["doubleTap"] as? String {
			try element(label, in: app).doubleTap()
		}
		if let label = step["press"] as? String {
			try element(label, in: app).press(forDuration: step["seconds"] as? Double ?? 1)
		}
		if let label = step["springboard"] as? String {
			try element(label, in: springboard).tap()
		}
		if let point = step["tapAt"] as? [Double], point.count == 2 {
			coordinate(point[0], point[1], in: app).tap()
		}
		if let path = step["drag"] as? [Double], path.count == 4 {
			let start = coordinate(path[0], path[1], in: app)
			let end = coordinate(path[2], path[3], in: app)
			start.press(forDuration: 0.05, thenDragTo: end)
		}
		if let options = step["dragHold"] as? [String: Any] {
			try dragHold(options, in: app)
		}
		if let text = step["type"] as? String {
			app.typeText(text)
		}
		if let direction = step["swipe"] as? String {
			let target: XCUIElement = try (step["on"] as? String).map { try element($0, in: app) } ?? app
			switch direction {
			case "up": target.swipeUp()
			case "down": target.swipeDown()
			case "left": target.swipeLeft()
			case "right": target.swipeRight()
			default: XCTFail("unknown swipe direction \(direction)")
			}
		}
		if let seconds = step["wait"] as? Double {
			Thread.sleep(forTimeInterval: seconds)
		}
		if let label = step["expect"] as? String {
			_ = try element(label, in: app)
		}
		if let label = step["expectGone"] as? String {
			let gone = NSPredicate(format: "exists == false")
			let match = app.descendants(matching: .any).matching(labelled(label)).firstMatch
			let result = XCTWaiter().wait(for: [expectation(for: gone, evaluatedWith: match)], timeout: timeout)
			XCTAssertEqual(result, .completed, "\(label) is still shown")
		}
		if let visible = step["keyboard"] as? Bool {
			XCTAssertEqual(app.keyboards.count > 0, visible, "keyboard visible should be \(visible)")
		}
		try capture(step, of: app)
	}

	private func dragHold(_ options: [String: Any], in app: XCUIApplication) throws {
		guard let path = options["path"] as? [Double], path.count == 4 else {
			throw failure("dragHold needs a path of [x1, y1, x2, y2]")
		}
		let press = 0.05
		let hold = options["hold"] as? Double ?? 2
		let velocity = options["velocity"] as? Double ?? 1000
		let start = coordinate(path[0], path[1], in: app)
		let end = coordinate(path[2], path[3], in: app)
		let travel = hypot(end.screenPoint.x - start.screenPoint.x, end.screenPoint.y - start.screenPoint.y) / velocity
		let captured = captureLater(options, of: app, after: press + travel + hold / 2)
		start.press(forDuration: press, thenDragTo: end, withVelocity: XCUIGestureVelocity(velocity), thenHoldForDuration: hold)
		try captured()
	}

	private func captureLater(_ options: [String: Any], of app: XCUIApplication, after delay: TimeInterval) -> () throws -> Void {
		let done = XCTestExpectation(description: "capture during the hold")
		var outcome: Result<Void, Error> = .success(())
		DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
			outcome = Result { try self.capture(options, of: app) }
			done.fulfill()
		}
		return {
			guard XCTWaiter().wait(for: [done], timeout: self.timeout) == .completed else {
				throw self.failure("capture during the hold timed out")
			}
			try outcome.get()
		}
	}

	private func capture(_ options: [String: Any], of app: XCUIApplication) throws {
		if let path = options["screenshot"] as? String {
			try XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: path))
		}
		if let path = options["tree"] as? String {
			try app.debugDescription.write(toFile: path, atomically: true, encoding: .utf8)
		}
	}

	private func orientation(_ name: String) throws -> UIDeviceOrientation {
		switch name {
		case "portrait": return .portrait
		case "landscapeLeft": return .landscapeLeft
		case "landscapeRight": return .landscapeRight
		default: throw failure("unknown orientation \(name)")
		}
	}

	private func coordinate(_ x: Double, _ y: Double, in app: XCUIApplication) -> XCUICoordinate {
		app.coordinate(withNormalizedOffset: CGVector(dx: x, dy: y))
	}

	private func labelled(_ label: String) -> NSPredicate {
		NSPredicate(format: "label == %@ OR identifier == %@ OR placeholderValue == %@", label, label, label)
	}

	private func element(_ label: String, in app: XCUIApplication) throws -> XCUIElement {
		try first(label, in: app.descendants(matching: .any))
	}

	private func first(_ label: String, in query: XCUIElementQuery) throws -> XCUIElement {
		let match = query.matching(labelled(label)).firstMatch
		guard match.waitForExistence(timeout: timeout) else {
			throw failure("no element labelled \(label)")
		}
		return match
	}

	private func failure(_ message: String) -> NSError {
		NSError(domain: "Driver", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
	}
}
