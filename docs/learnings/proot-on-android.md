# proot on Android (Termux + proot-distro)

**Last updated:** 2026-05-05 - first encountered while turning a Realme phone into a 24/7 home server.

## Mental model

Android is Linux at the kernel level, but its **userspace is not a normal Linux distribution**. Termux gives you a usable Linux-like userspace built on Android's bionic libc. **proot** layers on top of that to make it look like a "real" distro (Ubuntu, Debian, Arch, etc.) without root, by intercepting system calls and rewriting paths. **proot-distro** is a convenience wrapper that downloads and manages distro rootfs trees you can `login` into.

## Why it exists

Android intentionally restricts what apps can do without root: no `chroot`, no privileged ports, restricted filesystem access. To run software that expects a standard Linux environment (`apt-get`, glibc, normal `/etc`, normal `/usr`), you need either:
- **Root the device** (high effort, voids warranty, breaks OTA updates), or
- **User-space emulation** that fakes the standard layout without needing root.

`proot` is the latter. It's not a virtual machine; it's a syscall-translation tool. The kernel still sees Android processes; the processes themselves see Ubuntu (or whatever).

## How it actually works

```
                        Android Linux kernel
                                |
                                v
             [ Termux native userspace - bionic libc ]
                                |
                                v
                [ proot - intercepts syscalls, ptrace ]
                                |
                                v
              [ proot-distro Ubuntu rootfs - glibc ]
                                |
                                v
                  [ your processes: dotnet, node, ... ]
```

Key points:
- **proot uses `ptrace`** to intercept syscalls. This is the same mechanism debuggers use. Each syscall the process makes gets paused, inspected, possibly path-rewritten, then resumed.
- **No real chroot.** The process sees `/`, but proot translates that to the rootfs directory under Termux.
- **No real namespaces.** Unlike Docker, there's no kernel-level isolation. The Android kernel's PID list still includes everything.

## Performance reality

The main cost is `ptrace` overhead per syscall. Rough order of magnitude:
- **~10-15% overhead** on syscall-heavy workloads (file I/O, fork-heavy scripts).
- **Near-zero overhead** on CPU-heavy work that stays in userspace (math, JIT'd code).
- **proot-distro login** itself takes 20-30s on most phones because it sets up bind mounts for `/proc`, `/sys`, `/dev`, `/system`, and the Termux home before forking the shell. This cost is per session, not per command.

For a personal-use REST API + SQLite: invisible. For a high-throughput build server: noticeable.

## Common misconceptions

- **"proot is a container like Docker."** No. Containers use kernel namespaces and cgroups for real isolation. proot fakes the filesystem layout but provides no isolation; processes inside proot can see and signal anything Termux can.
- **"proot needs root."** No. That's its whole point. ptrace works for any process you own.
- **"systemd works in proot."** Not really. systemd expects to be PID 1 with full kernel features. proot can't provide that without major effort. Most distro-in-proot setups use plain shell scripts, `nohup`, `tmux`, or runit-based alternatives.
- **"Termux and proot are the same thing."** Termux is the Android app providing a Linux userspace. proot is a separate tool that runs *inside* Termux to give you a different distro's rootfs. You can use Termux without proot for many tasks (it has its own apt-like package manager, `pkg`).

## When it matters in practice

### Choosing this vs. alternatives

| Approach | Effort | Performance | Compatibility | Risk |
|---|---|---|---|---|
| **Termux native** | Low | Best | Limited (Android-flavored libs) | Safe |
| **Termux + proot-distro** | Low | ~10-15% syscall overhead | Excellent (real distro) | Safe |
| **Linux Deploy + chroot (rooted)** | High | Native | Excellent | Bricks risk, no OTA |
| **Replace OS (postmarketOS, etc.)** | Very high | Native | Excellent | Bricks risk, no Android apps |
| **Docker in Termux** | Medium-high | Native-ish | Good | Often broken |

For a personal home server with low traffic, **Termux + proot-distro is the right answer**. The overhead doesn't matter; the convenience and safety do.

### Service management

Without systemd, options are:
- **`nohup` + PID files**: dead simple, no extra deps, awkward to inspect.
- **`tmux`**: lets you `attach` later to see live logs, processes survive shell exit. Recommended.
- **`runit` via termux-services**: needs Termux integration; works for Termux-native services, awkward for proot-side processes.

### Auto-start across reboots

Termux dies when Android reboots. To bring it back automatically:
1. Install **Termux:Boot** from F-Droid (the Play Store version doesn't include the boot helper).
2. Drop scripts into `~/.termux/boot/`.
3. Each script runs once at phone power-on.

A typical pattern:
```bash
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock              # prevent Android from killing us
sshd                          # start SSH for remote access
proot-distro login ubuntu --no-link2symlink -- bash -c '
  tmux new-session -d -s api  "cd ~/app/backend && ASPNETCORE_URLS=http://0.0.0.0:5115 dotnet App.dll"
  tmux new-session -d -s web  "cd ~/app/frontend && PORT=3000 HOSTNAME=0.0.0.0 node server.js"
'
```

### Battery optimization

Android aggressively kills background apps. Two settings on the phone:
1. **Battery optimization off for Termux** (Settings > Apps > Termux > Battery > Don't optimize).
2. **`termux-wake-lock`** in the boot script keeps the CPU partially awake.

Without both, the phone can kill Termux within hours.

### Filesystem performance

Phone storage is typically eMMC or UFS - fast read, slower random writes. For SQLite under proot, this is fine for personal-scale data. Avoid heavy random-write workloads on cheap phones.

## Further reading

- proot upstream: https://proot-me.github.io/
- proot-distro on GitHub: https://github.com/termux/proot-distro
- Termux wiki on Termux:Boot: https://wiki.termux.com/wiki/Termux:Boot
- Why systemd doesn't work cleanly: https://wiki.archlinux.org/title/Proot
