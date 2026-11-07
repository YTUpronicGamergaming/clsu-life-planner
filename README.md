# CLSU Life Planner

A calm, practical place for CLSU students to see their class schedule and keep personal plans in view. CLSU Life Planner brings recurring class meetings and dated tasks together in one private-by-device planner.

> **Unofficial student project.** CLSU Life Planner is not an official CLSU service and is not affiliated with or endorsed by Central Luzon State University.

## What it does

- **Live class timetable:** View today's schedule or the full seven-day week, with a Philippine-time clock, current-time marker, and summary of the class in progress or coming up next.
- **Personal planning:** Add dated study sessions, assignments, reminders, errands, and other activities. Mark them complete, edit them, or remove them; all-day plans are supported.
- **One calendar for both:** See timed personal plans alongside fixed class meetings. Overlapping plans are highlighted so you can adjust them yourself; enrolled classes are never silently moved.
- **Made for your day:** Jump to **Now**, choose a 12- or 24-hour clock, or expand the timetable to full screen.
- **At-a-glance display:** Open the schedule-only display view in a live web view or a dedicated browser window. It refreshes while open, keeping the schedule visible without the rest of the planner interface.
- **Installable and offline-friendly:** Install the planner on supported devices. The app shell and most recently saved schedule can be viewed offline; schedule edits require a connection.
- **Flexible schedule setup:** Import a CLSU registration-form PDF after reviewing the detected classes, or add class meetings manually. Export or import JSON and CSV backups.
- **A focused, understated interface:** Warm neutral colors, deep green accents, responsive layouts, and a dark appearance option.

## Privacy by design

The planner does not ask for a student account or CLSU credentials. If you import a registration-form PDF, the PDF is processed in your browser; only the class details you confirm are sent to the service. Your schedule is associated with a private device cookie rather than a public share link.

The display API requires that same private device cookie. It is intended for a display on the same origin—not for a public, cross-origin widget. Do not share your device session or browser profile. This is not end-to-end encrypted storage, so keep a personal backup if you need one.

## Project documentation

For private development notes, deployment details, import formats, and technical behavior, see [README.personal.md](./README.personal.md).
