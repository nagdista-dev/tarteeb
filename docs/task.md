Implement the following UX and notification fixes.

## 1. Reset Scroll Position On Page Change

Current behavior:
When navigating between tabs/pages, the scroll position is preserved from the previous page.

This creates a poor user experience because users may open a page and land somewhere in the middle instead of the top.

Required behavior:

- Whenever the user navigates to any page/tab, automatically scroll the page container to the top.
- The new page should always start from its initial position.
- This should work consistently for:
  - Home
  - Alternative Plan
  - Tasks
  - Journal
  - Habits
  - Sleep
  - Drinks
  - Prayer Tracking
  - Pulse Dashboard
  - Settings
  - Guide
  - Contact
  - Any future page

Implementation requirements:

- Audit how navigation currently works.
- Identify the actual scroll container being used (window or custom container).
- Use the correct scrolling target.
- Prevent visual flickering.
- Ensure mobile and desktop behavior are identical.
- Verify that opening modals does not trigger unwanted scroll resets.

Expected result:
Every page navigation starts from the top of the page.

---

## 2. Critical Notification Bug

Current issue:

Notification sounds are being played after a page refresh/reload.

This is a major bug.

Users should never hear notification sounds simply because the application refreshed.

Required investigation:

- Audit the complete notification lifecycle.
- Inspect all notification-related useEffect hooks.
- Inspect initialization logic.
- Inspect currentTime synchronization logic.
- Inspect prayer notifications.
- Inspect task notifications.
- Inspect countdown notifications.
- Inspect service-worker interactions.
- Inspect app startup behavior.

Possible root causes to investigate:

- Notification checks firing before initialization is complete.
- Replayed notifications after reload.
- Lost in-memory notification state after refresh.
- Effects running during hydration/startup.
- Timers immediately matching notification conditions.
- appReady protection not working correctly.

Required fix:

- A browser refresh must NEVER trigger notification sounds.
- A page reload must NEVER replay already-expired notifications.
- Notification sounds should only play when an actual new notification event occurs after the application has fully initialized.
- Existing legitimate notifications must continue working normally.

Verification:

After implementing the fix:

1. Open the application.
2. Refresh multiple times.
3. Hard refresh.
4. Reopen the tab.
5. Reopen the browser.

Confirm that no notification sound is played unless a real notification event occurs after initialization.

Provide a detailed explanation of:

- Root cause.
- Files modified.
- Exact fix implemented.
- Why the fix prevents future regressions.
