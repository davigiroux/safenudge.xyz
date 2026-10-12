# Monitoring and Events

How we watch the SafeNudge program on-chain before and after the mainnet launch, and which Anchor events the program emits so that watching is useful.

The tool is [Solana Microscope](https://github.com/solana-foundation/solana-microscope) (Solana Foundation, MIT, first published September 2026). This doc records what it does, what it cannot do, and the configuration we plan to run. Facts about Microscope were read from its source at commit `fb22551`; re-check them when upgrading.

Status: **events shipped, monitoring proposed.** The program emits eleven events (§3). PR #82 added nine, and `GroupClosed` and `JoinAuthoritySet` came later. No Microscope deployment exists yet.

---

## 1. Why we monitor

Two risks matter more than any bug in a single instruction:

1. **Upgrade authority.** Until `--final` ([ADR-0001](./adr/0001-defer-program-immutability-to-multisig.md)), whoever controls the Squads multisig that holds upgrade authority can replace `distribute`. That is the Drift vector. A proposal on that multisig must page a human within a minute, every time, with no exceptions.
2. **Settlement that does not happen.** `distribute` and `emergency_cancel` are permissionless or creator-only, and both can fail for reasons the program cannot fix alone (a frozen member token account, rent changes; see the Key Design Decisions log in `CLAUDE.md`). A failed settlement means user funds stay in a vault. We need to see failed attempts, not only successful ones.

Everything else (volume, fees collected, deposit streaks) is dashboard material, not paging material.

## 2. How Microscope works

```text
Yellowstone gRPC ─┐                       ┌─> Prometheus (metrics) ─┐
                  ├─> indexer (Carbon,    │                         ├─> Grafana ─> Slack / Telegram / PagerDuty
RPC polling ──────┘   decoder built from  └─> stdout JSON ─> Alloy ─> Loki (records) ─┘
                      our IDL)
```

- **One deployment = one program + at most one Squads multisig.** SafeNudge and SafePool (if SafePool ever ships its own program) need separate deployments.
- **Datasource.** Yellowstone gRPC (default, low latency) or RPC polling via `getSignaturesForAddress` at `confirmed`. Both include failed transactions. With `RPC_URL` set in Yellowstone mode, RPC also fills stream gaps. RPC mode works against a plain devnet RPC, so devnet needs no gRPC provider.
- **Decoder is compiled from the IDL.** The program ID and IDL hash are build inputs. The indexer refuses to start if either differs from `microscope.toml`. Every program upgrade that changes the IDL requires `just generate` and an image rebuild (see §6).
- **Records.** Each decoded item becomes one JSON line in Loki. The shapes we care about:

  | Record | Key fields |
  | --- | --- |
  | `program_instruction` | `name` (snake_case), `data.accounts.<account>` (base58), `data.data.<arg>`, `failed`, `signature`, `slot`, `instruction_path`, `stack_height` |
  | `program_event` | `name` (snake_case of the event struct), `data.<field>`, `source` (`log` or `cpi`), `instruction` (parent instruction), `failed` |
  | `multisig_activity` | `action` (for example `proposal_created`), `squads_version`, `data`, `failed` |
  | `event_decode_failure` | `rejected` (count), `source`, `instruction`, `signature` |

  The instruction and event paths were checked against real devnet records on 2026-10-11. A `create_group` produced both records below (addresses shortened). An instruction with no arguments, such as `emergency_cancel`, has `data.data = {}`.

  ```json
  {"kind":"program_instruction","name":"create_group","failed":false,
   "data":{"accounts":{"creator":"…","group_config":"…","mint":"…","rent_payer":"…","vault":"…"},
           "data":{"group_code":"…","deposit_amount":1000000,"frequency":0,"total_periods":4,"max_members":3,"penalty_type":0,"penalty_value":100000}}}
  {"kind":"program_event","name":"group_created","instruction":"create_group","source":"log","failed":false,
   "data":{"group":"…","creator":"…","rent_payer":"…","mint":"…","deposit_amount":1000000,"total_periods":4,"max_members":3}}
  ```

- **Alerts** are generated from `[[alerts]]` in `microscope.toml` into Grafana rules (LogQL over Loki). A rule fires when at least one matching record exists in the lookback window. Conditions use JSON paths and the operators `exists`, `contains`, `eq`, `ne`, `gt`, `gte`, `lt`, `lte`. Numbers compare as float64, so integer values above 2^53 are rejected; USDC amounts are far below that.
- **Failed transactions** are recorded with `failed: true` for instructions and events. Multisig alerts never fire on failed Squads instructions.
- **CPI calls** are decoded too (`stack_height` > 1), so a SafeNudge instruction invoked from another program still shows up.

## 3. Program events

Few instructions take arguments, and the amounts move inside token CPIs that Microscope does not decode. So an instruction record tells us *that* `deposit` or `distribute` ran, by whom, and for which group, but never *how much*. Events close that gap. Before PR #82 the IDL had `events: []`. PR #82 added nine events in `programs/safenudge/src/events.rs`, and the IDL declares them.

### 3.1 `emit!`, not `emit_cpi!`

Microscope decodes both styles into the same record shape (`source: log` vs `source: cpi`). We use **`emit!`**:

| | `emit!` | `emit_cpi!` |
| --- | --- | --- |
| Accounts | None added | Adds `event_authority` + `program` to every emitting instruction. That shifts account positions and is a breaking interface change for SafePool (same class of change as the rent-payer upgrade). |
| Compute | One `sol_log_data` syscall | One self-CPI per event; `distribute` must fit the default compute limit the app sends (PR #67), and 11 extra CPIs eat into it |
| Risk | Log truncation past the ~10 KB per-transaction log limit drops the event with no error | Not affected by log truncation |
| Microscope side effect | None | Each event also writes a `program_instruction` record named `cpi_event`, which cannot be targeted by alerts |

Truncation is the only argument for `emit_cpi!`. Our worst case is `distribute` with 10 members: the program writes no `msg!` lines, so the log is the runtime's invoke/success lines for about 11 `transfer_checked` CPIs and one `close_account`, plus the event payloads. That is well under 10 KB. If a future instruction gets close, re-evaluate there.

### 3.2 Events the program emits

Amounts are raw token units (`u64`); the client formats them. One event per state change; no event duplicates an instruction argument that the instruction record already carries.

| Instruction | Event | Fields | Why |
| --- | --- | --- | --- |
| `create_group` | `GroupCreated` | `group`, `creator`, `rent_payer`, `mint`, `deposit_amount`, `total_periods`, `max_members` | One record per group with everything a dashboard needs, without joining instruction args |
| `join_group` | `MemberJoined` | `group`, `member`, `rent_payer`, `amount`, `current_members` | First deposit amount; group fill level |
| `leave_group` | `MemberLeft` | `group`, `member`, `refund`, `current_members` | Refund amount |
| `start_cycle` | `CycleStarted` | `group`, `members`, `cycle_start`, `cycle_end` | Lets us alert on groups whose `cycle_end` passed with no settlement |
| `deposit` | `DepositMade` | `group`, `member`, `period`, `amount`, `deposits_made` | Compliance and volume |
| `distribute` | `MemberSettled` (one per member) | `group`, `member`, `deposited`, `penalty`, `payout` | Per-member outcome; payout cap checks |
| `distribute` | `GroupSettled` | `group`, `members`, `compliant_count`, `total_penalties`, `protocol_fee`, `total_paid` | Fee revenue; conservation check off-chain (`total_paid + protocol_fee` equals the vault balance before settlement) |
| `emergency_cancel` | `GroupCancelled` | `group`, `creator`, `members`, `refunded_total`, `burned` | `burned > 0` is rare and must be visible |
| `withdraw_fees` | `FeesWithdrawn` | `recipient`, `mint`, `amount` | Treasury outflow |
| `set_join_authority` | `JoinAuthoritySet` | `group`, `creator`, `authority` | Which groups are gated and by which key; a key change between groups at one code is visible |
| `close_group` | `GroupClosed` | `group`, `rent_payer`, `lamports`, `join_gate_lamports` | End of a group's life; rent returned. `lamports` is the `GroupConfig` balance (vault rent included when `refund_vault_rent` never ran), `join_gate_lamports` the gate's (0 without one) |
| `init_treasury` | none | — | Instruction record is enough (one-shot) |
| `refund_vault_rent`, `close_member_record` | none | — | Lamport-only, no token movement |

Three instructions emit nothing: `init_treasury`, `refund_vault_rent` and `close_member_record`.

How the events are emitted:

- Each handler calls `emit!` as its last step, after all state mutation and CPIs succeed. An event never describes a state the transaction did not reach. A failed transaction carries no event, and the `failed: true` instruction record is the signal.
- `distribute` emits one `MemberSettled` per member and then `GroupSettled`, after the vault closes.
- Events add no accounts and no arguments, so the change was additive for SafePool: the IDL gained `events` and `types`, and call sites did not change. SafePool repins the IDL to decode events.
- Field names are snake_case and flat. Microscope field paths only accept segments that start with a letter or `_`, so array elements (for example `periods_deposited[3]`) cannot be addressed. Events carry no arrays.
- The `events` tests in `tests/safenudge.ts` decode each event from the transaction logs and assert its fields. The 10-member settlement test checks that `GroupSettled.total_paid` plus `protocol_fee` equals the vault balance before settlement.

## 4. Configuration

`microscope.toml` for the first deployment (devnet, RPC mode). Values in `<...>` are filled in locally; the multisig addresses and the `.env` file are not committed to this repository.

```toml
program_id = "GxruFdaFHYPv9MqhFM2MoFWyYNXGnmhdTpy1MFHXJSUc"   # devnet
idl_path = "idl/safenudge.json"                               # copy of target/idl/safenudge.json at the deployed commit

[multisig]                      # add once the devnet Squad from ADR-0001 exists
vault_address = "<SQUADS_DEFAULT_VAULT>"
state_address = "<SQUADS_MULTISIG_ACCOUNT>"
version = "v4"

[datasource]
mode = "rpc"
poll_interval_seconds = 5
replay_window_slots = 300

[dashboard]
event_fields = ["name", "instruction", "signature", "slot", "failed", "data.group", "data.member", "data.amount", "data.payout", "data.protocol_fee"]
multisig_fields = ["action", "instruction", "signature", "slot", "failed"]

[alerting]
lookback_window_seconds = 60
evaluation_interval_seconds = 10
explorer_transaction_url = "https://explorer.solana.com/tx/{signature}?cluster=devnet"

# ── Upgrade authority (critical) ──────────────────────────────
[[alerts]]
kind = "multisig"
name = "proposal_created"
severity = "critical"
channels = ["telegram"]

[[alerts]]
kind = "multisig"
name = "proposal_approved"
severity = "critical"
channels = ["telegram"]

[[alerts]]
kind = "multisig"
name = "transaction_executed"
severity = "critical"
channels = ["telegram"]

[[alerts]]
kind = "multisig"
name = "configuration_transaction_created"   # member, threshold, time-lock changes
severity = "critical"
channels = ["telegram"]

# ── Settlement health ─────────────────────────────────────────
[[alerts]]
kind = "instruction"
name = "distribute"
conditions = [{ field = "failed", operator = "eq", value = true }]
severity = "error"
channels = ["telegram"]

[[alerts]]
kind = "instruction"
name = "emergency_cancel"
conditions = [{ field = "failed", operator = "eq", value = false }]
severity = "warning"
channels = ["telegram"]

# ── Treasury ──────────────────────────────────────────────────
[[alerts]]
kind = "instruction"
name = "withdraw_fees"
conditions = [{ field = "failed", operator = "eq", value = false }]
severity = "warning"
channels = ["telegram"]

[[alerts]]
kind = "instruction"
name = "init_treasury"
severity = "warning"
channels = ["telegram"]
```

Once the deployed binary includes PR #82 and `idl_path` points at its IDL, add:

```toml
[[alerts]]
kind = "event"
name = "group_cancelled"
conditions = [{ field = "data.burned", operator = "gt", value = 0 }]
severity = "error"
channels = ["telegram"]
```

Alert names are checked against the IDL at startup: an event alert for an event the IDL does not declare fails to start, so event alerts land in the same change as the IDL that declares them.

`.env` keys: `RPC_URL`, `GRAFANA_ADMIN_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. A channel listed in an alert with an empty credential fails generation, so set every channel you reference.

### What Microscope cannot alert on

- **"The program was upgraded."** Microscope does not decode the BPF Upgradeable Loader. A Squads `transaction_executed` record does not say what the transaction ran; the content is in the earlier `transaction_created` record. So we alert on every proposal and every execution on the authority multisig, and a human reads the proposal. Any execution on that multisig is unexpected outside a planned upgrade window.
- **An upgrade signed outside the multisig.** If upgrade authority is ever moved off the multisig, the multisig alerts no longer cover it. Until `--final`, also check the program's upgrade authority on a schedule (`solana program show <PROGRAM_ID>`) and alert when it is not the Squad vault. See §7.
- **Groups past `cycle_end` with no settlement.** Microscope alerts on records that exist, not on records that are missing. See §7.
- **Missing events.** If logs were truncated, an `emit!` event is absent and nothing records the absence. Only payloads that fail to decode produce `event_decode_failure`.

## 5. Deployment

| Phase | Where | Datasource | Notes |
| --- | --- | --- | --- |
| Trial (done, 2026-10-11) | Local Docker Compose | RPC polling, devnet | Field paths confirmed (§2). A `create_group` and an `emergency_cancel` each reached Telegram within about a minute. A `group_cancelled` with `burned = 0` did not fire, as configured. |
| Grafana Cloud trial (done, 2026-10-12) | Indexer and Alloy local, Grafana Cloud for storage, dashboards and alerts | Same | Records and metrics reached the stack, a `group_created` alert fired from Cloud, and `RPC polling stale` fired while the host slept. See §5.1. |
| Squad rehearsal | Same | Same | Add `[multisig]` for the devnet Squad when ADR-0001's devnet rehearsal starts; every step of the rehearsal must produce the expected alert. |
| Mainnet | Small VM (AWS or GCP) running the indexer and Alloy, pushing to Grafana Cloud | Yellowstone + `RPC_URL` gap recovery | The VM runs no Grafana, Loki or Prometheus, so it can be smaller than the 2 vCPU / 4 GiB the full stack needs. Must be running and proven before upgrade authority moves to the mainnet Squad. |

Operational notes:

- In local mode, Grafana, Prometheus and the indexer bind to `127.0.0.1`; reach them through an SSH or SSM tunnel. Do not publish ports. Alert links point at `localhost` and do not open on a phone.
- `just up` regenerates alert rules and recreates Grafana. Plain `docker compose up` on a running stack keeps the old rules. In local mode it can also drop a notification template copied into the alerting volume.
- Activity alerts use `noDataState = OK`: if Loki is down, activity alerts do not fire. The stack provisions its own health alerts (stale datasource, poll failures, Alloy delivery); keep those routed to the same channel.
- Secrets are in `.env` and, for Terraform deployments, in Terraform state. Treat the state bucket as secret.
- Backfill (`just backfill 7d`) writes history into Loki with original timestamps and does not fire alerts.

### 5.1 Grafana Cloud

Microscope's cloud overlay (`docker-compose.cloud.yml`) runs only the indexer and Alloy. Alloy pushes records and metrics to a Grafana Cloud stack, and dashboards, alert rules and the Telegram contact point live there.

- **Separate stack for SafeNudge.** Grafana Cloud does not bind a write token to a deployment label, so any write token for a stack can write under any deployment name. A separate stack keeps another project's leaked token away from our alerts.
- **Two tokens.** The VM holds an access policy token with only `logs:write` and `metrics:write`. Rules, contact points and templates are pushed from a workstation with a service account token, which never goes on the VM.
- **Provisioning.** `scripts/export-grafana-cloud.sh <deployment> <folder-uid>` writes the dashboard, rules, contact points and routes. Push contact points before rules. Rule UIDs are derived from content, so an edited alert gets a new UID; run the `DELETE` calls the script prints, or the old rule keeps firing.

### 5.2 Alert messages

Microscope's Telegram contact point sets no message, so Grafana sends its default text: every label, a silence link and dashboard links. After the export, the push step changes three things:

- **Template.** A notification template `sn.message`, used by the Telegram contact points with `parse_mode = HTML`:

  ```
  {{ define "sn.icon" }}{{ if eq .Labels.severity "critical" }}🚨{{ else if eq .Labels.severity "error" }}🔴{{ else if eq .Labels.severity "warning" }}🟠{{ else }}🔵{{ end }}{{ end }}
  {{ define "sn.message" }}{{ range .Alerts.Firing }}{{ template "sn.icon" . }} <b>{{ or .Labels.signal_name .Labels.alertname }}</b> · {{ .Labels.severity }}
  {{ .Annotations.description }}
  {{ if .Labels.signature }}<a href="{{ reReplaceAll "^\\S+ " "" .Annotations.transaction }}">Transaction</a> · {{ end }}{{ if .PanelURL }}<a href="{{ .PanelURL }}">Dashboard</a>{{ else if .DashboardURL }}<a href="{{ .DashboardURL }}">Dashboard</a>{{ else }}<a href="{{ .GeneratorURL }}">Rule</a>{{ end }}
  {{ end }}{{ range .Alerts.Resolved }}✅ resolved: {{ or .Labels.signal_name .Labels.alertname }}
  {{ end }}{{ end }}
  ```

- **No resolved message for activity alerts.** A one-time event has nothing to resolve. Rules with `signal_kind` `instruction`, `event` or `multisig` go to a second contact point with `disableResolveMessage = true`. Health rules keep the resolved message, because "polling recovered" is useful.
- **Links.** In Grafana Cloud the Dashboard link opens on a phone. In local mode it points at `localhost`.

The exported rules name their receiver in `notification_settings`, so changing that field is enough; the policy tree is not used.

Still a limit in Microscope: alert labels carry the rule name and the signature, not record fields such as `data.group` or `data.refunded_total`. The message links to the transaction; the amounts are in Loki.

Health alerts fire when the indexer host stops: on the devnet trial, a sleeping laptop fired `RPC polling stale` within minutes.

## 6. When the program changes

These steps are part of the upgrade checklist in `ARCHITECTURE.md` ("Upgrades that change an account layout"):

1. Copy the new `target/idl/safenudge.json` into the Microscope deployment.
2. `just generate`, rebuild the image, `just up`. The indexer will not start against a mismatched IDL hash, so a skipped step is visible, not silent.
3. Records before the upgrade are decoded with the new IDL if backfilled again; do not re-backfill across a layout change.
4. Expect a Squads alert for every step of the upgrade itself. An upgrade that produced no alert means monitoring is broken.

## 7. Checks outside Microscope

Two checks from §4 need a scheduled job, because they alert on a state, not on a transaction:

| Check | Reads | Alerts when |
| --- | --- | --- |
| Upgrade authority | Program's `ProgramData` account | Authority is not the Squad vault (or, after `--final`, is not `None`) |
| Unsettled groups | `GroupConfig` accounts (`memcmp` on status) | Status is Active and `cycle_start + total_periods × period` passed more than 24 hours ago |

They run as a systemd timer (every 10 minutes) on the same VM as Microscope, as a small script in this repository, and send to the same Telegram bot. Not GitHub Actions: scheduled workflows can start hours late and are disabled after 60 days without repository activity.

The script also sends one message per day saying all checks passed. A missing daily message means the VM, the bot, or the script is down. Microscope's own alerts cannot report that, because they run on the same machine.

The script is [`ops/watchdog`](../ops/watchdog/README.md); install steps and the systemd units are there. It sends a message only when a finding appears or clears, plus the daily one, and keeps open findings in a state file. A check that cannot read the chain becomes an `rpc:<check>` finding and the run exits nonzero. Configuration, all from `/etc/safenudge/watchdog.env`:

- `RPC_URL` (secret: contains an API key), `PROGRAM_ID` (default: the devnet program).
- `EXPECTED_UPGRADE_AUTHORITY`: the Squad vault, or `none` after `--final`.
- `CLUSTER`: `devnet` or `mainnet`. Must match the build's cargo feature, because `--features devnet` adds the five-minute frequency 3.
- `GRACE_HOURS` (default 24), `STATE_PATH` (default `/var/lib/safenudge-watchdog/state.json`).
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

`npm run watchdog -- --dry-run` prints the messages instead of sending them.

## 8. Decisions

- Alert channel: Telegram only. PagerDuty can be added per rule later without changing anything else.
- Recipients: the maintainer's Telegram. Chat IDs and bot tokens live only in `.env` on the deployment host.
- Dashboards and alert evaluation: Grafana Cloud, in a stack used only by SafeNudge (§5.1). It gives dashboards and working alert links on a phone without publishing a port, and no Grafana to patch on the VM.
