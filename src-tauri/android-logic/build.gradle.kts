plugins {
	kotlin("jvm") version "2.1.21"
}

repositories {
	mavenCentral()
}

dependencies {
	compileOnly("org.json:json:20250517")
	testImplementation("org.json:json:20250517")
	testImplementation("junit:junit:4.13.2")
}

kotlin {
	jvmToolchain(21)
}

tasks.withType<Test>().configureEach {
	testLogging {
		events("failed")
		exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
	}
}
