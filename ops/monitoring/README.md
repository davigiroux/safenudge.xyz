# Monitoring host

Runs Microscope's indexer, Grafana Alloy and the [watchdog](../watchdog/README.md) as systemd services on one Linux host, without Docker. Grafana Cloud stores the records and metrics and sends the alerts. Design and rationale are in [docs/monitoring.md §5](../../docs/monitoring.md#5-deployment).

```
host (systemd, user safenudge-mon)                   Grafana Cloud
  safenudge-indexer ── journald ──┐                    Loki ─┐
     └ 127.0.0.1:9090 metrics ────┤ safenudge-alloy ──▶      ├─ alert rules ─▶ Telegram
                                  └──────────────────▶ Prom ─┘
  safenudge-watchdog.timer (10 min) ─────────────────────────────────────────▶ Telegram
  safenudge-firewall: drops tcp 9090, 9091, 12345 except on lo
```

## Files

| File | Installed to |
| --- | --- |
| `microscope.<cluster>.toml` | `/opt/safenudge/microscope/microscope.toml`, and built into the indexer's decoder |
| `alloy.alloy` | `/opt/safenudge/alloy/config.alloy` |
| `nft.conf` | `/etc/safenudge/nft.conf` |
| `units/*` | `/etc/systemd/system/` |
| `env/*.env.example` | template for `/etc/safenudge/*.env` (mode 600, root; systemd reads them before it drops to `safenudge-mon`) |
| `push-cloud.py` | not installed; runs on a workstation, see below |

The indexer binds its metrics and probe ports to `0.0.0.0` with no option to change it, so `safenudge-firewall` drops them on every interface except loopback. Alloy listens on `127.0.0.1:12345`.

## Install or upgrade

On a workstation with Docker:

```sh
ops/monitoring/build.sh devnet /tmp/bundle
```

The script clones Microscope at a pinned commit, builds the indexer for `linux/amd64` with `microscope.devnet.toml` and `app/src/idl/safenudge.json`, bundles the watchdog with esbuild, and downloads Alloy and Node with checksum checks. The bundle has no secrets.

First install only: copy each `env/*.env.example` to `/tmp/bundle/env/<name>.env` and fill it in. Then:

```sh
rsync -a /tmp/bundle/ host:safenudge-install/
ssh -t host 'sudo ~/safenudge-install/install.sh && rm -rf ~/safenudge-install'
```

An upgrade without `env/` keeps the env files in `/etc/safenudge`. `/opt/safenudge/SOURCE_COMMIT` records the commit of this repository the bundle came from.

Check:

```sh
systemctl status safenudge-indexer safenudge-alloy safenudge-watchdog.timer
journalctl -u safenudge-watchdog.service -n 20
```

## Alert rules and Telegram routing

Grafana Cloud holds the rules. From a Microscope checkout with the same `microscope.toml` and IDL, and a `.env` with `GRAFANA_URL`, `GRAFANA_API_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` and `MICROSCOPE_DEPLOYMENT`:

```sh
set -a; . ./.env; set +a
./scripts/export-grafana-cloud.sh "$MICROSCOPE_DEPLOYMENT" safenudge
python3 <safenudge.xyz>/ops/monitoring/push-cloud.py
```

`push-cloud.py` pushes the message template, four Telegram contact points, the rules with their routes and the dashboard. Routing is in [docs/monitoring.md §5.2](../../docs/monitoring.md#52-alert-messages). `PAUSE_HEALTH=1` pushes the health rules paused, for a host that sleeps.
