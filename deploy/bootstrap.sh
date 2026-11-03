#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu VPS (Hostinger) for the crawler and the API.
# Safe to re-run. Run as root, passing the public half of the CI deploy key:
#
#   ssh root@<vps> "bash -s -- '$(cat ~/.ssh/magicwebs_deploy.pub)'" < deploy/bootstrap.sh
#
# Installs Docker, creates a `deploy` user that CI logs in as, prepares
# /opt/magicwebs/<service> for each service, turns on the firewall (SSH and
# HTTP/HTTPS for Caddy), automatic security updates, fail2ban and a swap file.
set -euo pipefail

DEPLOY_USER=deploy
SERVICES=(crawler api)
DEPLOY_PUBKEY="${1:-}"

if [ "$(id -u)" -ne 0 ]; then echo "Run as root" >&2; exit 1; fi
if [ -z "$DEPLOY_PUBKEY" ]; then echo "Pass the CI deploy public key as the first argument" >&2; exit 1; fi

export DEBIAN_FRONTEND=noninteractive

echo "==> System packages"
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl ufw fail2ban unattended-upgrades

echo "==> Docker"
if ! command -v docker >/dev/null; then
  # Docker's own repo first; fall back to Ubuntu's packages if it does not cover this release yet.
  if ! curl -fsSL https://get.docker.com | sh; then
    apt-get install -yq docker.io docker-compose-v2
  fi
fi
mkdir -p /etc/docker
if [ ! -f /etc/docker/daemon.json ]; then
  cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
JSON
fi
systemctl enable --now docker
systemctl restart docker
docker compose version

echo "==> Deploy user"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi
# Membership in the docker group is what lets CI run compose; it is root-equivalent on this box.
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
grep -qxF "$DEPLOY_PUBKEY" "/home/$DEPLOY_USER/.ssh/authorized_keys" \
  || echo "$DEPLOY_PUBKEY" >> "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

echo "==> Deploy directories"
install -d -m 755 /opt/magicwebs
for service in "${SERVICES[@]}"; do
  dir="/opt/magicwebs/$service"
  install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$dir"
  if [ ! -f "$dir/$service.env" ]; then
    install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /dev/null "$dir/$service.env"
  fi
done

echo "==> Firewall"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
# Caddy (API stack) serves HTTPS and answers Let's Encrypt on port 80. Docker's
# own iptables rules publish these regardless; the rules keep ufw's view honest.
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> fail2ban and automatic security updates"
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Swap"
if ! swapon --show | grep -q .; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo
echo "Done. Next: fill in /opt/magicwebs/<service>/<service>.env for each service (see deploy/README.md)."
