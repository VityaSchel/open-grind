import XCTest

final class Driver: XCTestCase {
	private let timeout: TimeInterval = 15

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
		let environment = ProcessInfo.processInfo.environment
		let stepsPath = try XCTUnwrap(environment["OG_STEPS"], "OG_STEPS is not set")
		let data = try Data(contentsOf: URL(fileURLWithPath: stepsPath))
		let steps = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [[String: Any]])
		let app = XCUIApplication(bundleIdentifier: environment["OG_BUNDLE"] ?? "org.opengrind.app")

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
		if let label = step["tap"] as? String {
			try element(label, in: app).tap()
		}
		if let label = step["tapIfPresent"] as? String {
			let match = app.descendants(matching: .any).matching(labelled(label)).firstMatch
			if match.waitForExistence(timeout: 3) {
				match.tap()
			}
		}
		if let point = step["tapAt"] as? [Double], point.count == 2 {
			app.coordinate(withNormalizedOffset: CGVector(dx: point[0], dy: point[1])).tap()
		}
		if let path = step["drag"] as? [Double], path.count == 4 {
			let start = app.coordinate(withNormalizedOffset: CGVector(dx: path[0], dy: path[1]))
			let end = app.coordinate(withNormalizedOffset: CGVector(dx: path[2], dy: path[3]))
			start.press(forDuration: 0.05, thenDragTo: end)
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
		if let path = step["screenshot"] as? String {
			try XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: path))
		}
		if let path = step["tree"] as? String {
			try app.debugDescription.write(toFile: path, atomically: true, encoding: .utf8)
		}
	}

	private func labelled(_ label: String) -> NSPredicate {
		NSPredicate(format: "label == %@ OR identifier == %@ OR placeholderValue == %@", label, label, label)
	}

	private func element(_ label: String, in app: XCUIApplication) throws -> XCUIElement {
		let match = app.descendants(matching: .any).matching(labelled(label)).firstMatch
		guard match.waitForExistence(timeout: timeout) else {
			throw NSError(domain: "Driver", code: 1, userInfo: [NSLocalizedDescriptionKey: "no element labelled \(label)"])
		}
		return match
	}
}
