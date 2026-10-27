import UIKit
import XCTest

final class Driver: XCTestCase {
	private static let stepKeys: Set<String> = [
		"launch", "activate", "home", "rotate", "pasteboardImage", "pasteboardText", "tap", "tapSecure", "tapIfPresent",
		"doubleTap", "press", "seconds", "springboard", "tapAt", "drag", "dragHold", "type", "swipe", "on", "wait",
		"expect", "expectGone", "keyboard", "screenshot", "tree",
	]
	private static let dragHoldKeys: Set<String> = ["path", "hold", "velocity", "screenshot", "tree"]
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
		continueAfterFailure = false
		let stepsPath = try XCTUnwrap(ProcessInfo.processInfo.environment["OG_STEPS"], "OG_STEPS is not set")
		let data = try Data(contentsOf: URL(fileURLWithPath: stepsPath))
		let steps = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [[String: Any]])
		for (index, step) in steps.enumerated() {
			try rejectUnknownKeys(in: step, known: Self.stepKeys, of: "step \(index + 1)")
			if let options: [String: Any] = try value("dragHold", in: step) {
				try rejectUnknownKeys(in: options, known: Self.dragHoldKeys, of: "step \(index + 1) dragHold")
			}
		}
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
		if let name: String = try value("rotate", in: step) {
			XCUIDevice.shared.orientation = try orientation(name)
		}
		if let path: String = try value("pasteboardImage", in: step) {
			UIPasteboard.general.image = try XCTUnwrap(UIImage(contentsOfFile: path), "no image at \(path)")
			guard UIPasteboard.general.hasImages else { throw failure("pasteboard holds no image") }
		}
		if let path: String = try value("pasteboardText", in: step) {
			UIPasteboard.general.string = try String(contentsOfFile: path, encoding: .utf8)
			guard UIPasteboard.general.hasStrings else { throw failure("pasteboard holds no text") }
		}
		if let label: String = try value("tap", in: step) {
			try element(label, in: app).tap()
		}
		if let label: String = try value("tapSecure", in: step) {
			try first(label, in: app.secureTextFields).tap()
		}
		if let label: String = try value("tapIfPresent", in: step) {
			let match = app.descendants(matching: .any).matching(labelled(label)).firstMatch
			if match.waitForExistence(timeout: 3) {
				match.tap()
			}
		}
		if let label: String = try value("doubleTap", in: step) {
			try element(label, in: app).doubleTap()
		}
		if let label: String = try value("press", in: step) {
			let seconds: Double = try value("seconds", in: step) ?? 1
			try element(label, in: app).press(forDuration: seconds)
		}
		if let label: String = try value("springboard", in: step) {
			try element(label, in: springboard).tap()
		}
		if let point: [Double] = try value("tapAt", in: step) {
			guard point.count == 2 else { throw failure("tapAt needs a point of [x, y]") }
			coordinate(point[0], point[1], in: app).tap()
		}
		if let path: [Double] = try value("drag", in: step) {
			guard path.count == 4 else { throw failure("drag needs a path of [x1, y1, x2, y2]") }
			let start = coordinate(path[0], path[1], in: app)
			let end = coordinate(path[2], path[3], in: app)
			start.press(forDuration: 0.05, thenDragTo: end)
		}
		if let options: [String: Any] = try value("dragHold", in: step) {
			try dragHold(options, in: app)
		}
		if let text: String = try value("type", in: step) {
			app.typeText(text)
		}
		if let direction: String = try value("swipe", in: step) {
			let on: String? = try value("on", in: step)
			let target: XCUIElement = try on.map { try element($0, in: app) } ?? app
			switch direction {
			case "up": target.swipeUp()
			case "down": target.swipeDown()
			case "left": target.swipeLeft()
			case "right": target.swipeRight()
			default: throw failure("unknown swipe direction \(direction)")
			}
		}
		if let seconds: Double = try value("wait", in: step) {
			Thread.sleep(forTimeInterval: seconds)
		}
		if let label: String = try value("expect", in: step) {
			_ = try element(label, in: app)
		}
		if let label: String = try value("expectGone", in: step) {
			let match = app.descendants(matching: .any).matching(labelled(label)).firstMatch
			guard disappears(match) else { throw failure("\(label) is still shown") }
		}
		if let visible: Bool = try value("keyboard", in: step) {
			let keyboard = app.keyboards.firstMatch
			guard visible ? keyboard.waitForExistence(timeout: timeout) : disappears(keyboard) else {
				throw failure("keyboard visible should be \(visible)")
			}
		}
		try capture(step, of: app)
	}

	private func dragHold(_ options: [String: Any], in app: XCUIApplication) throws {
		guard let path: [Double] = try value("path", in: options), path.count == 4 else {
			throw failure("dragHold needs a path of [x1, y1, x2, y2]")
		}
		let press = 0.05
		let hold: Double = try value("hold", in: options) ?? 2
		let velocity: Double = try value("velocity", in: options) ?? 1000
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
		if let path: String = try value("screenshot", in: options) {
			try XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: path))
		}
		if let path: String = try value("tree", in: options) {
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

	private func disappears(_ element: XCUIElement) -> Bool {
		let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: element)
		return XCTWaiter().wait(for: [gone], timeout: timeout) == .completed
	}

	private func value<T>(_ key: String, in options: [String: Any]) throws -> T? {
		guard let raw = options[key] else { return nil }
		guard let typed = raw as? T else { throw failure("\(key) needs a \(T.self), not \(raw)") }
		return typed
	}

	private func rejectUnknownKeys(in options: [String: Any], known: Set<String>, of name: String) throws {
		let unknown = Set(options.keys).subtracting(known)
		guard unknown.isEmpty else { throw failure("\(name) has unknown keys \(unknown.sorted())") }
	}

	private func failure(_ message: String) -> NSError {
		NSError(domain: "Driver", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
	}
}
