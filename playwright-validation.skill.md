---
name: falcon-dive-server-and-playwright-validation
description: Serve the Falcon Dive game locally and verify target gameplay behavior with Playwright-driven browser checks.
---

# Falcon Dive server + Playwright validation

Use this workflow whenever the game is changed and you need to verify that it still runs and behaves correctly through a real browser.

## 1) Start the local static server

From the project directory:

```powershell
cd "E:\Repos\Falcon Dive\falcon-dive"
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

The server listens on:

```text
http://localhost:8081/
```

If the game code changes while the server is already running, refresh the page in the browser; the static server serves updated files without recompiling.

## 2) Verify through Playwright behavior checks

Open the page in a browser and run targeted Playwright assertions for the game state rather than just checking page load. Aim for behavior-driven checks like:

- page loads successfully and the canvas is visible
- no browser console errors or page failures on first load
- the game loop is running and the world is drawn
- controls respond as expected:
  - mouse movement changes the bird heading
  - holding the mouse button changes flight mode / brake behavior
  - pressing `Space` triggers the turtle-drop action
  - pressing `P` or `Escape` pauses the game
- focal gameplay behaviors work after relevant code changes, such as:
  - ground prey reacts to visibility and hearing zones
  - the hare's hearing radius is treated as a simple circle when the bird enters range
  - score, catch, and alert messages update correctly when a prey object is noticed or caught

A simple verification loop is:

```javascript
await page.goto('http://localhost:8081/');
await page.waitForSelector('canvas');
await page.mouse.move(400, 300);
await page.mouse.down();
await page.mouse.up();
await page.keyboard.press('Space');
await page.keyboard.press('P');
await expect(page.locator('canvas')).toBeVisible();
```

Then add a specific check for the feature under test, such as checking that a warning or escape behavior appears when the bird enters the hare's hearing radius.

## 3) Acceptance standards for a fix

A code change is considered valid only when all of the following are true:

- the page still serves cleanly from `localhost:8081`
- the browser remains stable with no runtime errors
- the changed behavior is directly observed in Playwright
- the result matches the intended design for the feature or bug fix

## 4) Preferred debugging flow

When a bug involves AI-controlled prey or sensory logic, verify the exact loop in this order:

1. Start the server.
2. Open the page with Playwright.
3. Trigger the relevant state (approach, noise, alert, or catch). 
4. Inspect whether the expected warning state or reaction appears.
5. If not, narrow the bug to the specific visibility/hearing logic, then adjust code and rerun the same Playwright scenario.

This keeps validation grounded in observable game behavior rather than assumptions about the code alone.
