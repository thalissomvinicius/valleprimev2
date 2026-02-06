import argparse
import os
import sys
import time
import json
import requests


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default=os.environ.get("BACKEND_URL", "https://valleprimev2.onrender.com"))
    parser.add_argument("--push-key", default=os.environ.get("CONSULTA_PUSH_KEY", ""))
    parser.add_argument("--codes", default=os.environ.get("CONSULTA_CODES", "600"))
    parser.add_argument("--source", default=os.environ.get("CONSULTA_SOURCE", "http://177.221.240.85:8000"))
    parser.add_argument("--timeout", type=float, default=float(os.environ.get("CONSULTA_TIMEOUT", "20")))
    return parser.parse_args()


def fetch_source(source_base, code, timeout):
    url = f"{source_base.rstrip('/')}/api/consulta/{code}/"
    resp = requests.get(url, params={"t": int(time.time())}, timeout=timeout)
    resp.raise_for_status()
    try:
        return resp.json()
    except Exception:
        return json.loads(resp.text)


def push_backend(backend_base, code, payload, push_key, timeout):
    url = f"{backend_base.rstrip('/')}/api/consulta/push/{code}"
    headers = {"X-Consulta-Push-Key": push_key, "Content-Type": "application/json"}
    resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
    return resp.status_code, resp.text


def main():
    args = parse_args()
    if not args.push_key:
        print("Missing CONSULTA_PUSH_KEY (env or --push-key).", file=sys.stderr)
        return 2

    codes = [c.strip() for c in str(args.codes).split(",") if c.strip()]
    if not codes:
        print("No codes provided.", file=sys.stderr)
        return 2

    ok = True
    for code in codes:
        try:
            payload = fetch_source(args.source, code, args.timeout)
            status, text = push_backend(args.backend, code, payload, args.push_key, args.timeout)
            if status >= 200 and status < 300:
                print(f"{code}: OK ({status})")
            else:
                ok = False
                print(f"{code}: FAIL ({status}) {text}", file=sys.stderr)
        except Exception as e:
            ok = False
            print(f"{code}: ERROR {e}", file=sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

