plugins {
	kotlin("jvm") version "1.9.25"
}

repositories {
	mavenCentral()
}

dependencies {
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
