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

async function loadSchedule() {
  const status = get("#status");
  const refresh = get("#refresh");
  status.textContent = "Loading schedule…";
  refresh.disabled = true;
  try {
    const response = await fetch("/api/session", {
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Could not load schedule");

    let previousSchedule = null;
    try {
      const recoveryKey = "clsu_schedule_recovery_cache";
      if (result.deviceReset) {
        const previous = localStorage.getItem("clsu_schedule_cache");
        if (previous && !localStorage.getItem(recoveryKey)) {
          localStorage.setItem(recoveryKey, previous);
          previousSchedule = JSON.parse(previous);
        }
      } else {
        localStorage.setItem(
          "clsu_schedule_cache",
          JSON.stringify(result.schedule || {}),
        );
      }
    } catch {}

    if (!previousSchedule && result.deviceReset) {
      try {
        previousSchedule = JSON.parse(
          localStorage.getItem("clsu_schedule_recovery_cache") || "null",
        );
      } catch {}
    }

    if (previousSchedule && Array.isArray(previousSchedule.classes)) {
      render(previousSchedule);
      status.textContent =
        "Security reset · showing this browser's cached schedule; restore it from the main planner when ready";
    } else {
      render(result.schedule || {});
      status.textContent = result.deviceReset
        ? "New private device session · no previous browser copy found"
        : `Read-only · updated ${new Date().toLocaleTimeString("en-PH", { timeZone: "Asia/Manila" })}`;
    }
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
await loadSchedule();
