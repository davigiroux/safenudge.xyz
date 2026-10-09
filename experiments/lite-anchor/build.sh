#!/usr/bin/env bash
# Builds the three programs the parity harness loads, then runs it.
#
# Needs: rustup with a nightly toolchain (rust-src component), sbpf-linker on PATH,
# and the Solana CLI (for cargo build-sbf). See README.md.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"

# 1. The deployed Anchor program, as CI builds it.
cargo build-sbf --manifest-path "$repo/programs/safenudge/Cargo.toml"

# 2. The same program cut down to `deposit`, for a same-scope size comparison.
cargo build-sbf --manifest-path "$here/baselines/anchor-deposit/Cargo.toml"

# 3. The lite-anchor port, with upstream nightly Rust and sbpf-linker.
(cd "$here" && cargo +nightly build-bpf -p safenudge-lite)

# 4. Parity tests and the compute-unit report.
(cd "$here" && cargo +nightly test -p lite-anchor -p harness -- --nocapture)
