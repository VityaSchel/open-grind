"""Tier 2 (best-effort) mitmproxy addon: one redacted JSON line per request.
Runs only when the OkHttp pin is defeated at the framework level (LSPosed);
fingerprints come from the parallel Tier-1 pcap.

    mitmdump -s mitm/addon.py --set capture_out=out/mitm.jsonl --listen-port 8080
"""

import json
import time
from mitmproxy import ctx, http

REDACT_HEADERS = {"authorization", "cookie", "set-cookie", "x-sig", "x-nonce", "x-key-id"}
REDACT_QUERY = {"authtoken", "token", "password", "access_token"}


class Capture:
    def load(self, loader):
        loader.add_option("capture_out", str, "out/mitm.jsonl", "JSONL output path")

    def running(self):
        self.start = time.time()
        self.out = open(ctx.options.capture_out, "a")

    def response(self, flow: http.HTTPFlow):
        req = flow.request
        headers = [
            [k, f"<redacted len={len(v)}>" if k.lower() in REDACT_HEADERS else v]
            for k, v in req.headers.items(multi=True)
        ]
        query = {
            k: (f"<redacted len={len(v)}>" if k.lower() in REDACT_QUERY else v)
            for k, v in req.query.items()
        }
        raw = req.raw_content or b""
        try:
            body = raw.decode("utf-8")[:8192] if raw else None
        except UnicodeDecodeError:
            body = f"<binary {len(raw)} bytes>"
        line = json.dumps(
            {
                "t_ms": round((time.time() - self.start) * 1000),
                "method": req.method,
                "host": req.pretty_host,
                "path": req.path.split("?", 1)[0],
                "query": query,
                "headers": headers,
                "body": body,
                "status": flow.response.status_code if flow.response else None,
            },
            ensure_ascii=False,
        )
        self.out.write(line + "\n")
        self.out.flush()
        print(line, flush=True)

    def done(self):
        self.out.close()


addons = [Capture()]
