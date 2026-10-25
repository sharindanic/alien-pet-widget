# Journey: iPhone + Mac + Claude Code

Notes from one session (25 Oct 2026) of poking at an iPhone 11 Pro over a Lightning cable from a MacBook, using Claude Code. It started with a viral post ("this guy used Claude Code to scan his sister's iPhone for spyware") and ended with a pixel alien living on the home screen.

## 1. Talking to the iPhone from the Mac

Tools: [libimobiledevice](https://libimobiledevice.org) (`brew install libimobiledevice ideviceinstaller`).

| Command | What it does |
|---|---|
| `idevice_id -l` | Is the phone connected? |
| `ideviceinfo` | Model, iOS version, serial, etc. |
| `ideviceinstaller -l` | List every user-installed app |
| `idevicesyslog` | Live system log stream |
| `idevicediagnostics ioregentry AppleSmartBattery` | Real battery health (cycles, capacity) |
| `ideviceprovision list` | Installed provisioning profiles |
| `idevicecrashreport <dir>` | Pull (and clear) crash logs off the phone |

Findings:
- 22 user apps, nothing known-bad. Flagged a free VPN app as a privacy risk (all traffic goes through it).
- Battery: 3,331 cycles, ~67% of design capacity: time for a replacement.
- 2 minutes of syslog (~237k lines): only normal Apple system activity, nothing phoning home on a timer.
- Cleared ~148 MB of crash logs.

## 2. Spyware scan with MVT

[MVT (Mobile Verification Toolkit)](https://mvt.re) by Amnesty International, the tool used in the Pegasus investigations.

```bash
brew install pipx && pipx install mvt
mvt-ios download-iocs                     # 19 indicator lists, ~11.5k indicators
# Finder → iPhone → "Encrypt local backup" → Back Up Now
cd ~/Library/Application\ Support/MobileSync/Backup
mvt-ios decrypt-backup -d ~/iphone-scan <UDID>      # asks for the backup password
mvt-ios check-backup -o ~/iphone-scan-results ~/iphone-scan
```

Gotchas:
- The backup folder is protected by macOS. The terminal needs **Full Disk Access**.
- The backup password is the one set for "Encrypt local backup", not the phone passcode or Mac password.
- Long commands copied from a wrapped terminal pick up line breaks. Put them in a small script and run `bash script.sh`.
- The decrypted backup and the results contain messages, contacts, photos. Delete them when done.

Result: **0 indicator matches.** 2 HIGH alerts were one deleted DataUsage record from April 2024 claiming ~2 TB of mobile data: almost certainly a corrupted leftover from an uninstalled app, not spyware. 296 LOW alerts were normal gaps from uninstalled apps. Main real-world advice: update iOS.

## 3. Building the alien pet widget

Wanted something small and shareable that lives *on* the phone. Went with [Scriptable](https://scriptable.app): JavaScript widgets, no Xcode.

- Pixel sprite drawn with `DrawContext` from a 16×14 character grid; eyes and mouth stamped on per mood.
- Mood comes from `Device.isCharging()`, `Device.batteryLevel()`, time of day and when you last petted it.
- State (name, birthday, last fed/petted) saved as JSON via `FileManager.local()`.

Getting it onto the phone:
- AirDrop puts the `.js` in Files, not Scriptable. Move it into **Files → iCloud Drive → Scriptable** and it appears as a script.
- First run failed: `Font.roundedSystemFont` doesn't exist. Scriptable's name is `Font.regularRoundedSystemFont`.

Things learned:
- iOS refreshes widgets on its own schedule (roughly every 15–60 min). Unplugging the charger doesn't instantly change the mood.
- `config.widgetFamily` is undefined when previewing in-app, so pass the family explicitly for previews.
- The AssistiveTouch button can't be re-skinned without a jailbreak. Its single-tap action *can* run a Shortcut, though.

## Ideas for next

- "updated HH:MM" stamp on the widget so stale moods are obvious
- Lock screen widget version
- `iphone-checkup`: one command that runs section 1 and prints a report
