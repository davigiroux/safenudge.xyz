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
| `GRACE_HOURS` | no | `24` | Hours after `cycle_end` before an Active group is a finding. 0 to 168. |
| `RPC_FAILURES_BEFORE_ALERT` | no | `2` | Consecutive failed runs of one check before its `rpc:<check>` finding opens. 1 to 6, so an outage cannot go unreported for more than an hour. |
| `STATE_PATH` | no | `/var/lib/safenudge-watchdog/state.json` | Open findings, failure counts and the last heartbeat day. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | yes, except with `--dry-run` | | Bot API destination. |

## Dry run

Prints the messages instead of sending them, and does not write the state file:

```sh
npm ci
RPC_URL=... EXPECTED_UPGRADE_AUTHORITY=... npm run watchdog -- --dry-run
```

Exit code 1 means a check could not read the chain. After `RPC_FAILURES_BEFORE_ALERT` failed runs in a row, the check is reported as an `rpc:<check>` finding; before that, the run sends nothing and the check's earlier findings stay open. Exit code 2 means the run itself failed, for example a Telegram error; nothing was sent and the state file is unchanged, so the next run retries.

Invalid configuration also exits 2. When `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set, the run sends `🔴 watchdog config invalid: <reason>`, at most once per UTC day for the same reason, and records that in `<STATE_PATH>.config-alert`. The reason names the variable, never its value.

A state file that is not valid JSON, or has the wrong shape, does not stop the run. The run continues with an empty state and opens a `state-reset` finding, which resolves on the next run. The daily heartbeat can be sent a second time that day.

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
