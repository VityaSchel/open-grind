package org.opengrind.apporigin

fun entriesToCopy(legacy: Map<String, String>, current: Map<String, String>): Map<String, String> =
	legacy.filterKeys { it !in current }

fun movedKeys(legacy: Map<String, String>, current: Map<String, String>): Set<String> =
	legacy.keys.filterTo(HashSet()) { it in current }
