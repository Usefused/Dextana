# Teach Dex

Teach Dex turns a supervised desktop demonstration into a versioned personal skill. Choose **Teach Dex** beside **New activity**, describe the outcome, and explicitly choose **Start recording**. Recording never starts from navigation alone.

## Capture boundary

The Electron main process owns the teaching session and its local evidence. After macOS Accessibility and Screen Recording permission is granted, the native computer adapter samples the frontmost non-Dextana window. It records meaningful accessibility changes as app changes, clicks/focus changes, keyboard/value changes, or scrolling/structure changes. Each step carries bounded labels and surrounding accessibility structure. A screenshot is retained for meaningful steps when the accessibility snapshot contains no sensitive control.

Password, passcode, PIN, secret, verification-code, card-number and CVV controls have their values replaced with `[REDACTED]` before a step enters local session state. If any such control is present, the screenshot is omitted. The authenticated backend validates the same boundary and rejects suspicious unredacted evidence. Users can pause capture, add typed explanations, remove steps, finish, or discard the local recording. Voice explanation is not part of this milestone.

## Drafting and versions

Finishing sends the configured backend only the retained, redacted evidence needed to produce a draft. The backend identifies the objective, applications, semantic steps, connector/browser opportunities, decision rules, completion checks and unresolved questions. Review edits remain local until saved. Supporting screenshots appear in review but are not stored in the reusable skill version.

Saving writes the executable instructions through the existing personal-skill service and writes immutable structured versions alongside it. The Skills page distinguishes **Draft**, **Tested successfully**, and **Needs attention**, and supports **Run**, **Edit**, and **Archive**. Archiving disables the personal skill without deleting its version history. Input values are supplied per run and are not stored in the skill; test history records only which input fields were exercised.

## Supervised replay

**Try this skill** and **Run** ask for the current inputs and create an ordinary activity. The activity uses the existing browser, connector, computer-use and approval paths. The execution prompt requires fresh accessibility observations and semantic labels, never recorded coordinates, window positions, or row numbers. Material screen differences, ambiguous targets and unverifiable completion checks require user guidance.

The persistent supervision bar can pause, resume, stop, or accept a typed correction. Pause and stop use the normal activity cancellation boundary, preventing another action from beginning. A correction does not mutate the skill: it opens a proposed revision in the review screen. A completed correction-free run records the exact activity, time and names of supplied inputs as one successful test; it does not claim universal reliability. Stopped, failed, interrupted, or corrected runs mark the skill as needing attention.

## First milestone validation

The acceptance journey demonstrates a browser-to-desktop CRM workflow, reviews and edits the draft, starts a supervised run, proposes a correction, stops safely, and reruns with another customer input. Unit coverage verifies redaction, screenshot exclusion, semantic replay across moved windows and changed row indices, unexpected-screen guidance, version history and narrow test status.
