#!/bin/bash
# setup-phone-boot.sh
# One-time setup for the phone's Termux:Boot script.
#
# What this does:
#   - Replaces any existing ~/.termux/boot/start*.sh with a single consolidated script.
#   - The new script runs at phone power-on and brings the home-server stack up:
#       1. termux-wake-lock  -> prevent Android from killing Termux
#       2. sshd              -> start SSH server so the laptop can reach the phone
#       3. runsvdir          -> start the runit service supervisor (manages tasklog services)
#
# When to run:
#   - Once after installing termux-services on a fresh phone.
#   - Or any time you want to reset the boot script to the canonical version.
#
# After running:
#   - The next phone reboot will auto-start everything.
#   - To test without rebooting: ssh phone -t 'bash ~/.termux/boot/start-tasklog-server.sh'
#
# Usage (from repo root):
#   ./scripts/setup-phone-boot.sh

set -e

PHONE_HOST="phone"

echo "Updating Termux:Boot script on '$PHONE_HOST'..."

ssh "$PHONE_HOST" bash <<'EOF'
set -e

mkdir -p ~/.termux/boot

# Remove any old boot scripts (we consolidate into one).
rm -f ~/.termux/boot/start.sh ~/.termux/boot/start-server.sh

# Write the canonical one.
cat > ~/.termux/boot/start-tasklog-server.sh <<'BOOT'
#!/data/data/com.termux/files/usr/bin/bash
# Boots the Tasklog home-server stack on phone power-on.
# Managed by scripts/setup-phone-boot.sh in the Tasklog repo.

# 1. Keep Android from killing this process tree (battery optimization is also
#    disabled in Android settings - both are required, see guides/phone-server-setup.md).
termux-wake-lock

# 2. Start the SSH server so the laptop can deploy to and inspect this phone.
sshd

# 3. Start the runit service supervisor. It scans $PREFIX/var/service/ continuously
#    and brings up any service that doesn't have a 'down' file. The tasklog-api
#    and tasklog-web services live there (created by scripts/deploy-phone.sh).
if ! pgrep -x runsvdir >/dev/null 2>&1; then
    nohup runsvdir -P $PREFIX/var/service >/dev/null 2>&1 &
fi
BOOT

chmod +x ~/.termux/boot/start-tasklog-server.sh

echo "  written: ~/.termux/boot/start-tasklog-server.sh"
echo "  removed: any old ~/.termux/boot/start.sh, ~/.termux/boot/start-server.sh"
echo
echo "Active boot scripts:"
ls -la ~/.termux/boot/
EOF

echo
echo -e "\033[32mDone.\033[0m"
echo
echo "To verify before relying on auto-boot, run the script manually:"
echo "  ssh $PHONE_HOST -t 'bash ~/.termux/boot/start-tasklog-server.sh'"
echo
echo "After a phone reboot, services will come back up automatically. Verify with:"
echo "  ssh $PHONE_HOST 'SVDIR=\$PREFIX/var/service sv status tasklog-api tasklog-web'"
