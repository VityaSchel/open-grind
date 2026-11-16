package org.opengrind.push.relay

const val RESYNC_SKEW_SECONDS = 3600L

fun clampedResyncTs(ts: Long, nowSeconds: Long): Long = minOf(ts, nowSeconds + RESYNC_SKEW_SECONDS)
