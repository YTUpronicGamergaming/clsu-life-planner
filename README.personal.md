# CLSU Life Planner — Personal Project Notes

Private-by-device student planner combining a fixed class timetable, dated personal tasks, and a CAIS registration-form PDF importer (Plan A).

## Design acknowledgment

The public app acknowledges the CLSU CAIS experience as a reference for its academic timetable concept and schedule workflow. The project is independently designed and developed, with no claimed CLSU/CAIS affiliation or endorsement. Attribution does not grant permission to reuse CAIS names, marks, screenshots, assets, or distinctive protected expression; use original UI assets and seek permission where needed.

## CAIS import workflow
1. The student clicks **Open CAIS**. The official CAIS dashboard opens in a separate tab.
2. The student signs in directly on CAIS and downloads the Class Schedule registration-form PDF.
3. The student returns to CLSU Schedule and selects the PDF.
4. PDF.js extracts the schedule-details table locally in the browser. The PDF itself is not uploaded to the Worker.
5. The student reviews the detected classes and confirms import. Only the extracted class records are sent to the Worker and saved in D1.

The welcome screen stays visible after a schedule is created and includes a looping import walkthrough before the CAIS link. The custom square `public/new-import-guide.gif` is the primary guide; the existing `public/import-guide.gif` is the fallback. Optional theme-specific guides can be added as `public/import-guide_light.gif` and `public/import-guide_dark.gif`; the guide follows the selected theme when a matching file exists and otherwise uses the custom guide. Its square frame preserves Canva's 1:1 design ratio without cropping or distortion. Students can choose PDF import or open the manual-entry dialog at any time.

## Semantic versioning
- `package.json` is the canonical project version; npm keeps `package-lock.json` in sync.
- Use `npm run version:patch` for compatible fixes, `npm run version:minor` for new features, and `npm run version:major` for breaking changes.
- Keep the project pre-1.0 until its public behavior is stable. For each release, choose the bump by the most significant user-facing change and include the updated package files in the release commit.

The PDF parser currently targets the text-based, two-page CAIS Class Schedule PDF format inspected during development. It is not OCR; scanned/image-only PDFs are not supported. Review extracted entries before confirming. The uploaded sample was parsed locally into 14 class meetings across 10 subjects. The importer handles multiple meetings per subject and room labels such as `Async_` as schedule entries with the times printed in the details table.

PDF.js 4.10.38 is loaded from cdnjs when the user selects a PDF. This requires an internet connection during PDF import. No PDF bytes are sent to the application backend.

## Personal planner
- Class meetings remain fixed timetable entries; planner tasks never move or modify enrolled classes.
- Students can add dated tasks and activities with an optional start/end time. Leaving both times blank creates an all-day task.
- Categories: Study, Assignment, Personal, Reminder, and Organization. Priorities: low, normal, and high.
- Tasks can be edited, marked complete, or deleted. The date selector lets students plan future days, not only today.
- Scheduled tasks are checked against recurring class times and display a warning if they overlap a fixed class. The task is not silently moved or rejected.
- Planner tasks are stored in D1 under the same private anonymous device schedule. The cached schedule includes tasks for offline viewing; adding or changing tasks requires a connection.
- JSON backup includes both class meetings and planner tasks. JSON import can restore both.

## Live timetable and installable app
- Default landing view is **Today**, with a switch to the seven-day weekly calendar. Class meetings remain in the timetable on their recurring weekdays. Dated personal plans appear in a separate agenda below the timetable, where overlapping class times are called out without covering either event.
- Use **Now** to jump to the live time marker and current day. The marker stays visible at the nearest calendar edge before 7 AM and after 7 PM. The 12/24-hour preference is saved on the device and applies to the clock, calendar, agenda, and schedule details.
- The timetable supports native full-screen mode where available, with a CSS full-screen fallback. **Display view** opens a clean schedule-only page at `/?view=display`; it refreshes schedule data every 30 seconds while open.
- Use the **Install app** button for the browser install prompt when supported, or device-specific instructions when the browser does not provide a prompt. On iOS, use Safari's Share menu and choose Add to Home Screen.
- The compact visual theme uses warm neutral surfaces, deep green accents, and a restrained dark theme; the preference is saved on the device.
- Manual class entry and import/backup tools open in dialogs instead of taking up space on the main page.
- Personal planner content is collapsed by default and opens on demand. Schedule details initially show at least three meeting rows, with search and sortable column headers.
- A blue pulsating dot and horizontal line show current time in the timetable, using the `Asia/Manila` time zone. The Worker supplies a server timestamp when online to correct device-clock drift; offline, the last known offset is used with the device clock.
- The live summary identifies the current class and the next class across the recurring weekly schedule, including the day and countdown.
- Clock, date, agenda states, and marker position update every second without rebuilding the entire timetable.
- A web app manifest, icons, and service worker make the app installable as a PWA on supported browsers.
- The app shell and guide GIF are cached. The last schedule is cached in local browser storage for offline viewing. Offline changes are not queued or synchronized; reconnect before editing or importing.

## Privacy model
- No student account and no CAIS credentials are requested.
- The user authenticates directly on the official CAIS website in a separate tab.
- Do not collect or store CAIS passwords, session cookies, or CSRF tokens.
- Worker generates a random 256-bit device token in an HttpOnly, Secure, SameSite=Lax `__Host-clsu_device` cookie. The `__Host-` prefix requires a host-only cookie with `Path=/` and prevents sibling subdomains from setting a competing cookie. D1 stores only SHA-256(token). The legacy `clsu_device` cookie is never used for authentication and is expired when seen. After a security reset, the UI offers to restore the prior schedule from this browser's local cache; server data keyed only by the old cookie cannot be migrated safely.
- D1 stores extracted schedule records scoped to that device. This is not end-to-end encryption: the Worker processes the class details.
- Clearing browser cookies/site data loses access. Export JSON/CSV backups. JSON includes planner tasks as well as classes.
- The welcome screen visibility is not session-based. Schedule data is associated with a device cookie and cached in browser storage; the intro remains visible regardless of whether a schedule is already present.

## Response security
- The Worker adds HSTS, MIME-sniffing protection, same-origin frame restrictions, a strict referrer policy, and a restrictive permissions policy to app and API responses.
- HTML responses receive a Content Security Policy that allows scripts only from the same origin and pinned cdnjs URL; inline scripts and event handlers are blocked. The planner and fallback logic are external same-origin scripts. Styles remain inline-compatible for the current page design, and PDF.js is allowed from its pinned cdnjs URL.
- CSV exports prefix formula-leading cells as text; CSV import removes that export marker to preserve exact round trips. Worker-first routing returns 404 for backup HTML paths under `public/`; do not store private copies or stale app builds in the public asset directory.
- `/fallback.html` is a standalone read-only schedule view for maintenance or main-page failures. It uses the same private device session and can show the browser's last cached schedule if the API is unavailable. Its logic lives in `/fallback.js` so the strict CSP does not depend on an inline-script hash. The service worker precaches both fallback files and serves the page offline when directly requested. Old local HTML snapshots belong in `.private-backups/`, which is ignored by Git and outside the deployed assets directory.
- Maintenance mode can be deployed with `npm run maint:on`; restore the planner with `npm run maint:off`. These commands override `MAINTENANCE_MODE` for that deployment without changing `wrangler.jsonc`. A mode change creates a Worker deployment; Wrangler checks the static assets but only uploads changed files. In maintenance mode, the concise read-only page replaces the app; only `GET /api/status` and authenticated, read-only `GET /api/display` remain available. All other API calls return `503` without creating a device or schedule.
- There is no public sharing endpoint. `GET /api/display` returns only display fields (schedule title, class meeting details, and planner task details) and requires the same private device cookie as the planner. It sends `Cache-Control: no-store` and does not enable cross-origin access.
- The display URL and API are suitable for a same-origin live web view. A separate DIY widget hosted on another origin is not recommended yet: browser cookie/CORS restrictions prevent safe anonymous access, while making the endpoint public would expose private class and task details. A dedicated cross-device widget would need an explicit sharing/authorization model first.

### Display API
`GET /api/display` is read-only and requires the `__Host-clsu_device` cookie. It returns a minimal JSON object with `title`, `semester`, `academic_year`, `classes` (subject, section, weekday index, start/end time, and room), and `tasks` (title, notes, date, optional start/end time, category, and completion state). Responses are not cached and no CORS access is enabled. Open `/?view=display` for the ready-made live view; it refreshes this data every 30 seconds while visible.

## Future work: Plan B
Automated CAIS login/PDF retrieval is intentionally not part of this application or deployment. Any future Plan B investigation must be conducted in a separate, isolated test project and only after CLSU provides explicit authorization and a supported integration method. Never use real student credentials or production session cookies in test code.

## Setup
1. Install Node.js LTS.
2. Run `npm install`.
3. Authenticate: `npx wrangler login`.
4. Create D1: `npx wrangler d1 create clsu-schedule-db`.
5. Copy the returned database ID into `wrangler.jsonc`, replacing `REPLACE_WITH_D1_DATABASE_ID`.
6. Run `npm run db:local` and `npm run dev`.
7. Apply production migration: `npm run db:remote`.
8. Deploy: `npm run deploy`.

Use HTTPS (the deployed `workers.dev` URL) for service-worker and PWA installation. The URL will be `https://clsu-schedule.<your-workers-subdomain>.workers.dev`.

## Import formats
JSON backup supports both `classes` and optional `tasks` arrays. A task has `title`, `task_date` (`YYYY-MM-DD`), optional `start_time` and `end_time` (`HH:MM`, both present or both blank), `category`, `priority`, `notes`, and `completed`.

JSON classes: `{ "classes": [{ "subject_code":"IT 101", "subject_name":"Intro", "section":"BSIT 1-1", "day":0, "start_time":"08:00", "end_time":"09:30", "room":"Lab 1", "units":3 }] }`.

CSV headers: `subject_code,subject_name,section,day,start_time,end_time,room,units`. Day is Monday=0 through Saturday=5, or a weekday name. Times are 24-hour HH:MM.

## Before public launch
Add rate limiting, class editing, task editing, recurring personal tasks, deadline reminders, accessibility testing, stronger CSV parsing, backup/deletion policies, and a local copy of the PDF.js library if external CDN dependency is undesirable. Test PDF extraction against different CAIS semester PDFs before launch.
