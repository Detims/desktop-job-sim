# Desktop Pet — Minimal Core Artifact

A runnable Electron + PixiJS vertical slice targeting Windows 10 and Windows 11.

## Included

- Transparent, frameless, always-on-top pet window
- Generated four-frame placeholder sprite sheet animated at 12 FPS (within the 6–24 FPS target)
- Dragging the pet moves the window; position is not persisted
- Right-click pet overlay with Bob's energy, money, and management-window access
- Management window displaying Bob and starting one job
- 30-second job paying $10.00 on completion
- Cancellation from the working overlay with elapsed-time reward prorated and rounded to cents
- Energy begins at 100, drains at 1 per minute, remains depleted, and cancels work at zero
- In-memory main-process state
- Hidden management-window shortcut `Ctrl+Shift+E` to set energy to 0.05

## Run

Requires a supported Node.js/npm installation on Windows 10 or Windows 11.

```bash
npm install
npm run dev
```

Production-like local run:

```bash
npm install
npm start
```

## Manual acceptance checks

1. Bob renders in a transparent always-on-top window and animates.
2. Drag Bob and verify the window follows.
3. Right-click Bob, open management, and start the job.
4. Verify the working overlay displays remaining time and Cancel.
5. Cancel around 15 seconds; total money should increase by about $5.00, rounded to cents.
6. Start another job and let it complete; total money increases by $10.00.
7. In management press `Ctrl+Shift+E`, start a job, and verify it automatically cancels when energy reaches zero.
8. Restart the app; in-memory stats and window position reset.
