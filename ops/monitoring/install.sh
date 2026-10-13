#!/usr/bin/env bash
# Installs or upgrades the SafeNudge monitoring services (Microscope indexer, Alloy, watchdog) on systemd.
# Run from a bundle made by build.sh: sudo ./install.sh
# Env files: put indexer.env, alloy.env and watchdog.env in ./env/ on the first install. Later runs keep /etc/safenudge as is.
set -euo pipefail
cd "$(dirname "$0")"
[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 1; }

command -v nft >/dev/null || apt-get install -y --no-install-recommends nftables
command -v unzip >/dev/null || apt-get install -y --no-install-recommends unzip

id safenudge-mon >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin safenudge-mon

install -d -m 755 /opt/safenudge /opt/safenudge/microscope /opt/safenudge/microscope/idl /opt/safenudge/alloy /opt/safenudge/watchdog
install -d -m 750 -g safenudge-mon /etc/safenudge

for f in indexer alloy watchdog; do
  if [[ -f env/$f.env ]]; then
    install -m 640 -g safenudge-mon "env/$f.env" "/etc/safenudge/$f.env"
  elif [[ ! -f /etc/safenudge/$f.env ]]; then
    echo "missing env/$f.env (first install)" >&2; exit 1
  fi
done

install -m 755 microscope-indexer /opt/safenudge/microscope/microscope-indexer
install -m 644 microscope.toml /opt/safenudge/microscope/microscope.toml
install -m 644 idl/safenudge.json /opt/safenudge/microscope/idl/safenudge.json

unzip -o -q dl/alloy-linux-amd64.zip -d /opt/safenudge/alloy
mv -f /opt/safenudge/alloy/alloy-linux-amd64 /opt/safenudge/alloy/alloy
chmod 755 /opt/safenudge/alloy/alloy
install -m 644 alloy.alloy /opt/safenudge/alloy/config.alloy

rm -rf /opt/safenudge/node.new
mkdir /opt/safenudge/node.new
tar -xJf dl/node-linux-x64.tar.xz -C /opt/safenudge/node.new --strip-components=1
rm -rf /opt/safenudge/node
mv /opt/safenudge/node.new /opt/safenudge/node
install -m 644 watchdog.js /opt/safenudge/watchdog/watchdog.js
install -m 644 SOURCE_COMMIT /opt/safenudge/SOURCE_COMMIT

install -m 640 -g safenudge-mon nft.conf /etc/safenudge/nft.conf

install -m 644 units/* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now safenudge-firewall.service safenudge-indexer.service safenudge-alloy.service safenudge-watchdog.timer
systemctl restart safenudge-firewall.service safenudge-indexer.service safenudge-alloy.service

sleep 5
systemctl --no-pager --lines=0 status safenudge-firewall safenudge-indexer safenudge-alloy safenudge-watchdog.timer | grep -E "●|Active:"
[[ -d env ]] && echo "done. Delete this bundle directory: env/ holds secrets." || echo "done."
