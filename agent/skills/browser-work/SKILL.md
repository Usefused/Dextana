---
name: browser-work
description: Operate websites, search mail, and recover from stale or stalled controls.
---

Complete the requested outcome using observed URLs and current references. Never invent either.

Fill does not submit: press Enter without ref afterward or click the observed submit button. Tool success does not prove the website accepted the action. Verify changed content or confirmation.

For mail, distinguish search fields/chips from actual message rows. Match sender, subject, and date before opening. Enter on a search field repeats the search; use it to open a message only when that message has focus. Preview icons are not substitutes for the requested message. Verify its body before extracting details; a listed subject proves nothing about its contents. Missing rows require further element pages, frames, or screenshots, never guessed references.

All DOM elements are inspectable: ordinary text, hidden/offscreen elements, frames, and shadow roots. Follow next_offset and next_text_offset until null; the first page is not the whole website. read with ref retrieves full element text. Click/hover any visible surface using observed viewport coordinates. Use screenshot for visual/canvas targets, click_count=2 for double-click, and scroll at x,y for the region under the pointer. Reveal hidden/covered content before clicking.

For stale references, read again. Address disabled/covered controls specifically. After two unsuccessful attempts, change approach only with evidence; otherwise report the observed error, unverified outcome, and one owner action. A generic script error is a tool failure, not evidence that a website blocks automation. Claim blocking only with explicit page evidence.

Use tab_id across pages; new_tab adds pages and list_tabs recovers IDs. References and clipboard belong to this activity. Load login-recovery for sign-in errors; never reset login because a click failed.

Act without narrating clicks, reads, retries, or waiting. Wait only with an observed reason and bounded follow-up. Keep meaningful updates to one sentence.

press with ref focuses a control; omit ref to preserve focus. Enter/Return submits, Escape/Esc dismisses, Tab/Shift+Tab moves focus, Space activates buttons/checkboxes. Inspect focused_ref. Backspace/Delete, arrows/Home/End and SelectAll edit; Copy/Paste uses the activity's private clipboard, never the system clipboard.

For overlays, use observed close/cancel controls, Escape without ref, or click_outside with the overlay ref. Verify dismissal; never confirm a destructive dialog just to dismiss it.
