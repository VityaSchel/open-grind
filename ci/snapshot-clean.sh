#!/usr/bin/env bash
set -euxo pipefail

cloud-init clean --logs --seed || rm -rf /var/lib/cloud

rm -rf /var/lib/cloud/instance /var/lib/cloud/instances
rm -f /etc/ssh/ssh_host_*
truncate -s 0 /etc/machine-id
rm -f /var/lib/dbus/machine-id

journalctl --rotate || true
journalctl --vacuum-time=1s || true
find /var/log -type f -exec truncate -s 0 {} +

find /tmp -mindepth 1 -delete || true
find /var/tmp -mindepth 1 -delete || true
rm -f /root/.bash_history
rm -f /root/.ssh/authorized_keys

sync
