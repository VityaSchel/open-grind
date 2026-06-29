import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

fun prop(key: String): String =
    project.findProperty(key)?.toString()
        ?: error("Missing required property `$key`. " +
            "Add it to src-tauri/gen/android/gradle.properties.")

fun expandHome(path: String): String =
    if (path == "~" || path.startsWith("~/")) {
        System.getProperty("user.home") + path.substring(1)
    } else path

val keystorePropertiesFile = rootProject.file("keystore.properties")
val hasKeystore = keystorePropertiesFile.exists()

android {
    compileSdk = prop("opengrind.android.compileSdk").toInt()
    buildToolsVersion = prop("opengrind.android.buildTools")
    ndkVersion = prop("opengrind.android.ndk")
    namespace = "org.opengrind"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "org.opengrind"
        minSdk = prop("opengrind.android.minSdk").toInt()
        targetSdk = prop("opengrind.android.targetSdk").toInt()
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
	signingConfigs {
		if (hasKeystore) {
			create("release") {
				val keystoreProperties = Properties()
				keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }

				keyAlias = keystoreProperties["keyAlias"] as String
				keyPassword = keystoreProperties["password"] as String
				storeFile = file(expandHome(keystoreProperties["storeFile"] as String))
				storePassword = keystoreProperties["password"] as String
			}
		}
	}
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
				jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
			if (hasKeystore) {
				signingConfig = signingConfigs.getByName("release")
			}
        }
        getByName("release") {
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
			if (hasKeystore) {
				signingConfig = signingConfigs.getByName("release")
			}
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
    }
}

// Reproducibility: disable assets/dexopt/baseline.prof[m] and kotlin-tooling-metadata.json
tasks.whenTaskAdded {
    if (name.contains("ArtProfile") || name == "buildKotlinToolingMetadata") {
        enabled = false
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")