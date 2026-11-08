# CLSU Life Planner

A calm, practical place for CLSU students to see their class schedule and keep personal plans in view. CLSU Life Planner brings recurring class meetings and dated tasks together in one private-by-device planner.

> **Unofficial student project.** CLSU Life Planner is not an official CLSU service and is not affiliated with or endorsed by Central Luzon State University.

## Design acknowledgment

The academic timetable concept and schedule workflow were informed by the CLSU CAIS experience. CLSU Life Planner is independently designed and developed; this acknowledgment does not imply affiliation with or endorsement by CLSU or CAIS.

## What it does

- **Live class timetable:** View today's schedule or the full seven-day week, with a Philippine-time clock, current-time marker, and summary of the class in progress or coming up next.
- **Personal planning:** Add dated study sessions, assignments, reminders, errands, and other activities. Mark them complete, edit them, or remove them; all-day plans are supported.
- **Clear class and personal views:** Class meetings stay in the timetable, while dated personal plans appear in a separate agenda below it. Any time conflict is called out in the agenda, so events never cover each other and enrolled classes are never silently moved.
- **Made for your day:** Jump to **Now**, choose a 12- or 24-hour clock, or expand the timetable to full screen.
- **At-a-glance display:** Open the schedule-only display view in a live web view or a dedicated browser window. It refreshes while open, keeping the schedule visible without the rest of the planner interface.
- **Installable and offline-friendly:** Install the planner on supported devices. The app shell and most recently saved schedule can be viewed offline; schedule edits require a connection.
- **Flexible schedule setup:** Import a CLSU registration-form PDF after reviewing the detected classes, or add class meetings manually. Export or import JSON and CSV backups.
- **A focused, understated interface:** Warm neutral colors, deep green accents, responsive layouts, and a dark appearance option.

## Privacy by design

The planner does not ask for a student account or CLSU credentials. If you import a registration-form PDF, the PDF is processed in your browser; only the class details you confirm are sent to the service. Your schedule is saved in the service database and associated with a private, secure device cookie rather than a public share link. This keeps it available on that browser/device, but does not provide sign-in or cross-device syncing; keep an export backup in case you clear browser data. After a cookie security update, an existing browser may ask whether to restore its last locally cached schedule.

The display API requires that same private device cookie. It is intended for a display on the same origin—not for a public, cross-origin widget. Do not share your device session or browser profile. This is not end-to-end encrypted storage, so keep a personal backup if you need one.

## Project documentation

For private development notes, deployment details, import formats, and technical behavior, see [README.personal.md](./README.personal.md).
