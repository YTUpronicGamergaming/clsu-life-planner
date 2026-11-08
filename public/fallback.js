const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const get = (selector) => document.querySelector(selector);

function formatTime(value) {
  if (!value) return "All day";
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour < 12 ? "AM" : "PM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function addCell(row, value) {
  const cell = document.createElement("td");
  cell.textContent = value == null ? "" : String(value);
  row.append(cell);
}

function render(schedule) {
  const classes = Array.isArray(schedule.classes) ? schedule.classes : [];
  const tasks = Array.isArray(schedule.tasks) ? schedule.tasks : [];
  const hasSchedule = classes.length > 0 || tasks.length > 0;
  get("#emptyIntro").hidden = hasSchedule;
  get("#classSection").hidden = classes.length === 0;
  get("#tasksSection").hidden = tasks.length === 0;
  get("#scheduleTitle").textContent = schedule.title || "CLSU Life Planner";
  get("#semester").textContent =
    [schedule.semester, schedule.academic_year].filter(Boolean).join(" · ") ||
    "Read-only schedule view";

  const classBody = get("#classes");
  classBody.replaceChildren();
  classes
    .slice()
    .sort(
      (a, b) =>
        Number(a.day) - Number(b.day) ||
        String(a.start_time).localeCompare(String(b.start_time)),
    )
    .forEach((item) => {
      const row = document.createElement("tr");
      addCell(row, DAYS[Number(item.day)] || "—");
      addCell(
        row,
        `${formatTime(item.start_time)}${item.end_time ? `–${formatTime(item.end_time)}` : ""}`,
      );
      addCell(
        row,
        [item.subject_code, item.subject_name, item.section]
          .filter(Boolean)
          .join(" · "),
      );
      addCell(row, item.room);
      classBody.append(row);
    });
  get("#noClasses").hidden = classes.length > 0;

  const taskList = get("#tasks");
  taskList.replaceChildren();
  tasks
    .slice()
    .sort(
      (a, b) =>
        String(a.task_date).localeCompare(String(b.task_date)) ||
        String(a.start_time || "").localeCompare(String(b.start_time || "")),
    )
    .forEach((task) => {
      const item = document.createElement("li");
      item.className = "task";
      const title = document.createElement("span");
      title.className = "task-title";
      title.textContent = task.title || "Untitled plan";
      const meta = document.createElement("span");
      meta.className = "task-meta";
      const date = task.task_date
        ? new Intl.DateTimeFormat("en-PH", {
            dateStyle: "medium",
            timeZone: "Asia/Manila",
          }).format(new Date(`${task.task_date}T12:00:00+08:00`))
        : "";
      const time = task.start_time
        ? `${formatTime(task.start_time)}${task.end_time ? `–${formatTime(task.end_time)}` : ""}`
        : "All day";
      meta.textContent = `${date}${date ? " · " : ""}${time}${task.completed ? " · Done" : ""}`;
      item.append(title, meta);
      taskList.append(item);
    });
  get("#noTasks").hidden = tasks.length > 0;
}

async function checkMaintenance() {
  try {
    const response = await fetch("/api/status", {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const mode = await response.json();
    const maintenance = mode.maintenance === true;
    get("#maintenanceNotice").hidden = !maintenance;
    get("#mainPlannerLink").hidden = maintenance;
    get("#maintenanceFootnote").hidden = !maintenance;
    get("#emptyIntroStatus").textContent = maintenance
      ? "Maintenance is in progress. This read-only page stays available, but there is no saved schedule on this device to display. Please come back later."
      : "There is no schedule available on this device to display right now.";
    if (
      !maintenance &&
      ["/fallback", "/fallback.html"].includes(location.pathname)
    )
      location.replace("/");
    return maintenance;
  } catch {
    return null;
  }
}

async function loadSchedule() {
  const status = get("#status");
  const refresh = get("#refresh");
  status.textContent = "Loading schedule…";
  refresh.disabled = true;
  try {
    const maintenance = await checkMaintenance();
    if (
      maintenance === false &&
      ["/fallback", "/fallback.html"].includes(location.pathname)
    )
      return;

    const response = await fetch("/api/display", {
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Could not load schedule");
    render(result);
    status.textContent = maintenance
      ? "Read-only schedule"
      : `Read-only · updated ${new Date().toLocaleTimeString("en-PH", { timeZone: "Asia/Manila" })}`;
  } catch (error) {
    try {
      const cached = JSON.parse(
        localStorage.getItem("clsu_schedule_cache") || "null",
      );
      if (!cached || !Array.isArray(cached.classes))
        throw new Error("No cached schedule");
      render(cached);
      status.textContent =
        "Offline · showing the last schedule cached in this browser";
    } catch {
      get("#emptyIntro").hidden = false;
      get("#classSection").hidden = true;
      get("#tasksSection").hidden = true;
      get("#emptyIntroStatus").textContent =
        "A saved schedule could not be loaded on this device. The display is read-only; please check your connection and come back later.";
      status.textContent =
        error.name === "TimeoutError"
          ? "Schedule request timed out. Check your connection and try Refresh."
          : "Schedule unavailable. Check your connection and try Refresh.";
    }
  } finally {
    refresh.disabled = false;
  }
}

get("#refresh").addEventListener("click", loadSchedule);
setInterval(() => {
  if (document.visibilityState === "visible") checkMaintenance();
}, 15000);
await loadSchedule();
