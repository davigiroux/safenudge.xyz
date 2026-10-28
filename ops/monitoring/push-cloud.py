#!/usr/bin/env python3
"""Pushes the exported Microscope resources to Grafana Cloud with SafeNudge's Telegram routing."""
import glob
import json
import os
import sys
import urllib.error
import urllib.request

DEPLOYMENT = os.environ["MICROSCOPE_DEPLOYMENT"]
FOLDER = os.environ.get("GRAFANA_FOLDER", "safenudge")
URL = os.environ["GRAFANA_URL"].rstrip("/")
TOKEN = os.environ["GRAFANA_API_TOKEN"]
ACTIVITY_KINDS = {"instruction", "event", "multisig"}

TEMPLATE = r'''
{{ define "sn.icon" }}{{ if eq .Labels.severity "critical" }}🚨{{ else if eq .Labels.severity "error" }}🔴{{ else if eq .Labels.severity "warning" }}🟠{{ else }}🔵{{ end }}{{ end }}
{{ define "sn.message" }}{{ range .Alerts.Firing }}{{ template "sn.icon" . }} <b>{{ or .Labels.signal_name .Labels.alertname }}</b> · {{ .Labels.severity }}
{{ .Annotations.description }}
{{ if .Labels.signature }}<a href="{{ reReplaceAll "^\\S+ " "" .Annotations.transaction }}">Transaction</a> · {{ end }}{{ if .PanelURL }}<a href="{{ .PanelURL }}">Dashboard</a>{{ else if .DashboardURL }}<a href="{{ .DashboardURL }}">Dashboard</a>{{ else }}<a href="{{ .GeneratorURL }}">Rule</a>{{ end }}
{{ end }}{{ range .Alerts.Resolved }}✅ resolved: {{ or .Labels.signal_name .Labels.alertname }}
{{ end }}{{ end }}
'''


def call(method, path, body=None, extra=None):
    headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json", "X-Disable-Provenance": "true"}
    headers.update(extra or {})
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


def upsert(path, uid, body):
    status, out = call("PUT", f"{path}/{uid}", body)
    if status == 404:
        status, out = call("POST", path, body)
    if status >= 300:
        sys.exit(f"{path}/{uid}: {status} {out}")
    return status


def telegram_point(name, resolve, silent):
    # Grafana caps a contact point UID at 40 characters; rules route by name, so only the UID is shortened.
    return {
        "uid": name.replace("-telegram-", "-tg-"),
        "name": name,
        "type": "telegram",
        "settings": {
            "bottoken": os.environ["TELEGRAM_BOT_TOKEN"],
            "chatid": os.environ["TELEGRAM_CHAT_ID"],
            "message": '{{ template "sn.message" . }}',
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
            "disable_notification": silent,
        },
        "disableResolveMessage": not resolve,
    }


def route(rule):
    """Contact point and grouping for a rule: activity has no resolved message, only critical makes a sound."""
    kind = "activity" if rule["labels"].get("signal_kind") in ACTIVITY_KINDS else "health"
    tone = "loud" if rule["labels"].get("severity") == "critical" else "quiet"
    settings = {"receiver": f"{DEPLOYMENT}-telegram-{kind}-{tone}"}
    if kind == "health":
        settings.update(group_by=["deployment", "signal_kind"], group_wait="1m", group_interval="10m", repeat_interval="12h")
    return settings


status, out = call("PUT", "/api/v1/provisioning/templates/safenudge-telegram", {"template": TEMPLATE})
print("template", status if status < 300 else out)

for kind, resolve in (("activity", False), ("health", True)):
    for tone, silent in (("loud", False), ("quiet", True)):
        point = telegram_point(f"{DEPLOYMENT}-telegram-{kind}-{tone}", resolve, silent)
        print("contact point", point["name"], upsert("/api/v1/provisioning/contact-points", point["uid"], point))

pause_health = os.environ.get("PAUSE_HEALTH") == "1"
pushed = dropped = 0
for path in sorted(glob.glob(f"alert-rules/{DEPLOYMENT}/ms-*.json")):
    rule = json.load(open(path))
    if rule["labels"].get("severity") == "info":
        status, _ = call("DELETE", f"/api/v1/provisioning/alert-rules/{rule['uid']}")
        dropped += 1
        continue
    rule["notification_settings"] = route(rule)
    rule["isPaused"] = pause_health and rule["labels"].get("signal_kind") not in ACTIVITY_KINDS
    upsert("/api/v1/provisioning/alert-rules", rule["uid"], rule)
    pushed += 1
print("rules", pushed, "info rules kept off Telegram", dropped, "health paused" if pause_health else "health active")

for group in json.load(open(f"alert-rules/{DEPLOYMENT}/_rule-groups.json")):
    status, out = call("GET", f"/api/v1/provisioning/folder/{FOLDER}/rule-groups/{group['name']}")
    out["interval"] = group["interval_seconds"]
    status, out = call("PUT", f"/api/v1/provisioning/folder/{FOLDER}/rule-groups/{group['name']}", out)
    print("group", group["name"], status if status < 300 else out)

dashboard = json.load(open(f"dashboards/{DEPLOYMENT}.json"))
dashboard.pop("id", None)
status, out = call("POST", "/api/dashboards/db", {"dashboard": dashboard, "folderUid": FOLDER, "overwrite": True})
print("dashboard", status, out.get("url") if isinstance(out, dict) else out)
