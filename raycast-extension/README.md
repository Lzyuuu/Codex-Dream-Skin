# Codex Dream Skin for Raycast

Primary local macOS control surface for Codex Dream Skin. Raycast manages one
stable engine at `~/.codex/codex-dream-skin-studio`; normal operations never
start an injector from the source checkout.

## Local setup

```bash
npm install
npm run dev
```

The optional `DreamSkin Repository` preference is used only as the trusted
source for installing, synchronizing, or repairing the managed engine. Moving
or temporarily disconnecting that repository does not stop an already installed
engine from running. Select the new repository location before the next sync or
repair.

Run `Dream Skin Status` once to enable its menu-bar item. Raycast then provides:

- managed-engine install and source synchronization;
- start/reapply, theme switching, pause, and full Dream Skin exit;
- image-theme creation and validated ZIP import;
- verification screenshots, Gallery, Studio, themes, state, and log access;
- engine diagnosis and fail-closed repair.

Sync uses the normal safe shutdown path. Repair removes only Dream Skin's named
`launchd` jobs, quits ChatGPT, runs the existing atomic installer, validates the
payload with `doctor-macos.sh`, and leaves Dream Skin paused. It does not delete
saved themes or signal an unverified PID. Starting or applying after repair is a
separate explicit Raycast action.

## Checks

```bash
npm test
npm run lint
npm run build
```
