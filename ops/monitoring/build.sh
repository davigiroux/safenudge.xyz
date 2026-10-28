#!/usr/bin/env bash
# Builds the monitoring host bundle (linux/amd64): indexer, Alloy, Node, watchdog, configs and units.
# Usage: ops/monitoring/build.sh <cluster> <out-dir>    e.g. ops/monitoring/build.sh devnet /tmp/bundle
# Mainnet also needs SQUADS_VAULT and SQUADS_MULTISIG (the Squad's default vault and multisig account).
# Needs docker buildx, git, curl, npx. Writes no secrets: copy env/*.env.example to <out-dir>/env/ and fill them in.
set -euo pipefail

CLUSTER=${1:?cluster (devnet|mainnet)}
OUT=${2:?output directory}
REPO=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
HERE=$REPO/ops/monitoring
CONFIG=$HERE/microscope.$CLUSTER.toml
[[ -f $CONFIG ]] || { echo "no $CONFIG" >&2; exit 1; }

MICROSCOPE_REPO=https://github.com/solana-foundation/solana-microscope
MICROSCOPE_REF=fb225510424acc349446d61d2f4d6f7c2dc40dc4
ALLOY_VERSION=v1.17.1
ALLOY_SHA256=b92bfa2815a0a2c51477b4965d1ace3bf2ffc7b841e1361bd4cda6069e8c65bd
NODE_VERSION=v22.23.3
NODE_SHA256=df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de

fetch() {
  curl -fsSL -o "$1" "$2"
  echo "$3  $1" | shasum -a 256 -c - >/dev/null || { echo "checksum mismatch: $1" >&2; exit 1; }
}

mkdir -p "$OUT/dl" "$OUT/idl" "$OUT/units"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Multisig addresses are not committed; fill <SQUADS_VAULT> and <SQUADS_MULTISIG> from the environment.
sed -e "s/<SQUADS_VAULT>/${SQUADS_VAULT:-}/" -e "s/<SQUADS_MULTISIG>/${SQUADS_MULTISIG:-}/" "$CONFIG" > "$WORK/microscope.toml"
if grep -q '= ""' "$WORK/microscope.toml"; then
  echo "$CONFIG needs SQUADS_VAULT and SQUADS_MULTISIG set" >&2; exit 1
fi
CONFIG=$WORK/microscope.toml

# The decoder takes its program ID from the IDL address, which is the devnet ID in the repository.
PROGRAM_ID=$(sed -n 's/^program_id = "\(.*\)"$/\1/p' "$CONFIG")
IDL_ADDRESS=$(sed -n 's/^  "address": "\(.*\)",$/\1/p' "$REPO/idl/safenudge.json")
sed "s/^  \"address\": \"$IDL_ADDRESS\",$/  \"address\": \"$PROGRAM_ID\",/" "$REPO/idl/safenudge.json" > "$WORK/safenudge.json"
grep -q "^  \"address\": \"$PROGRAM_ID\",$" "$WORK/safenudge.json" || { echo "could not set the IDL address to $PROGRAM_ID" >&2; exit 1; }

git clone -q "$MICROSCOPE_REPO" "$WORK/microscope"
git -C "$WORK/microscope" checkout -q "$MICROSCOPE_REF"
cp "$CONFIG" "$WORK/microscope/microscope.toml"
mkdir -p "$WORK/microscope/idl"
cp "$WORK/safenudge.json" "$WORK/microscope/idl/safenudge.json"
docker buildx build -q --platform linux/amd64 -t safenudge-microscope-indexer:bundle --load "$WORK/microscope" >/dev/null
cid=$(docker create --platform linux/amd64 safenudge-microscope-indexer:bundle)
docker cp "$cid:/usr/local/bin/microscope-indexer" "$OUT/microscope-indexer"
docker rm "$cid" >/dev/null

npx -y esbuild@0.25.10 "$REPO/ops/watchdog/watchdog.ts" --bundle --platform=node --target=node22 \
  --format=cjs --outfile="$OUT/watchdog.js" --log-level=warning

fetch "$OUT/dl/alloy-linux-amd64.zip" \
  "https://github.com/grafana/alloy/releases/download/$ALLOY_VERSION/alloy-linux-amd64.zip" "$ALLOY_SHA256"
fetch "$OUT/dl/node-linux-x64.tar.xz" \
  "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.xz" "$NODE_SHA256"

cp "$CONFIG" "$OUT/microscope.toml"
cp "$WORK/safenudge.json" "$OUT/idl/safenudge.json"
cp "$HERE/alloy.alloy" "$HERE/nft.conf" "$HERE/install.sh" "$OUT/"
cp "$HERE"/units/* "$OUT/units/"
git -C "$REPO" rev-parse HEAD > "$OUT/SOURCE_COMMIT"
echo "bundle in $OUT (safenudge.xyz $(cut -c1-7 "$OUT/SOURCE_COMMIT"), microscope ${MICROSCOPE_REF:0:7})"
