# Watchdog

Scheduled checks that Microscope cannot alert on: the program's upgrade authority and Active groups that nobody settled. Design and rationale are in [docs/monitoring.md §7](../../docs/monitoring.md#7-checks-outside-microscope).

Each run sends a Telegram message only when a finding appears or clears, plus one heartbeat per UTC day. A missing heartbeat means the host, the bot or the script is down.

## Environment

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `RPC_URL` | yes | | RPC endpoint. Contains an API key; the script never prints it. |
| `EXPECTED_UPGRADE_AUTHORITY` | yes | | Address that must hold upgrade authority, or `none` after `--final`. |
| `PROGRAM_ID` | no | devnet program `GxruFdaFHYPv9MqhFM2MoFWyYNXGnmhdTpy1MFHXJSUc` | Program to watch. |
| `CLUSTER` | no | `devnet` | `devnet` or `mainnet`. Selects the period table: `devnet` adds the five-minute frequency 3 of `--features devnet` builds. |
| `GRACE_HOURS` | no | `24` | Hours after `cycle_end` before an Active group is a finding. |
| `STATE_PATH` | no | `/var/lib/safenudge-watchdog/state.json` | Open findings and the last heartbeat day. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | yes, except with `--dry-run` | | Bot API destination. |

## Dry run

Prints the messages instead of sending them, and does not write the state file:

```sh
npm ci
RPC_URL=... EXPECTED_UPGRADE_AUTHORITY=... npm run watchdog -- --dry-run
```

Exit code 1 means a check could not read the chain (it is also reported as an `rpc:<check>` finding). Exit code 2 means the run itself failed, for example bad configuration or a Telegram error; nothing was sent and the state file is unchanged, so the next run retries.

## Install

On the Microscope VM, as root:

```sh
git clone https://github.com/davigiroux/safenudge.xyz /opt/safenudge
cd /opt/safenudge && npm ci
install -d -m 700 /etc/safenudge
install -m 600 /dev/null /etc/safenudge/watchdog.env   # then fill in the variables above
cp ops/watchdog/safenudge-watchdog.{service,timer} /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now safenudge-watchdog.timer
journalctl -u safenudge-watchdog.service
```
