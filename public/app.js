
    document.documentElement.dataset.theme =
      localStorage.getItem("clsu_theme") === "dark" ? "dark" : "light";
    const DAYS = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const WEEK_DAYS = [...DAYS, "Sunday"];
    let data = { classes: [] },
      pendingImport = [],
      serverTimeOffset = Number(
        localStorage.getItem("clsu_clock_offset") || 0,
      );
    const clockNow = () => new Date(Date.now() + serverTimeOffset);
    const $ = (s) => document.querySelector(s);
    const GUIDE_ASSETS = Object.freeze({
      light: "/assets/guide-light.gif",
      dark: "/assets/guide-dark.gif",
      fallback: "/assets/import-guide.gif",
    });
    $("#printSchedule").addEventListener("click", () => window.print());
    const displayMode =
      new URLSearchParams(location.search).get("view") === "display";
    let timeFormat =
      localStorage.getItem("clsu_time_format") === "24" ? "24" : "12";
    if (displayMode) document.body.classList.add("display-mode");
    const say = (s) => ($("#status").textContent = s);
    const esc = (s) =>
      String(s ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
    async function api(p, o = {}) {
      let r = await fetch(p, {
        ...o,
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          ...(o.headers || {}),
        },
      }),
        d = await r.json();
      if (!r.ok) throw Error(d.error || "Request failed");
      const serverTime = Number(r.headers.get("x-server-time"));
      if (Number.isFinite(serverTime) && serverTime > 0) {
        serverTimeOffset = serverTime - Date.now();
        try {
          localStorage.setItem("clsu_clock_offset", String(serverTimeOffset));
        } catch { }
      }
      const cached = d.schedule || d;
      if (cached && Array.isArray(cached.classes))
        try {
          localStorage.setItem("clsu_schedule_cache", JSON.stringify(cached));
        } catch { }
      return d;
    }
    function mins(t) {
      let [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    }
    let viewMode = "today",
      importPanelOpen = false,
      editingTaskId = null;
    function manilaParts() {
      const ps = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).formatToParts(clockNow());
      return Object.fromEntries(ps.map((p) => [p.type, p.value]));
    }
    function manilaDay() {
      return { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[
        manilaParts().weekday
      ];
    }
    function manilaDate() {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(clockNow());
    }
    function fmtTime(t) {
      let [h, m] = t.split(":").map(Number);
      if (timeFormat === "24")
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
    }
    function taskDateDay(date) {
      return (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
    }
    function weekDate(day) {
      const date = new Date(manilaDate() + "T12:00:00Z");
      date.setUTCDate(date.getUTCDate() - manilaDay() + day);
      return date.toISOString().slice(0, 10);
    }
    function renderPlanner() {
      data.tasks = data.tasks || [];
      const selected = $("#taskDate").value || manilaDate();
      $("#taskDate").value = selected;
      $("#taskDateForm").value = selected;
      const items = data.tasks
        .filter((t) => t.task_date === selected)
        .sort((a, b) =>
          (a.start_time || "99:99").localeCompare(b.start_time || "99:99"),
        );
      const done = items.filter((t) => !!Number(t.completed)).length;
      $("#taskCounts").innerHTML =
        `<span class="pill">${items.length} planned</span><span class="pill">${done} completed</span><span class="pill">${items.length - done} remaining</span>`;
      $("#taskListHeading").textContent =
        "Tasks for " +
        new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(selected + "T12:00:00Z"));
      $("#taskList").innerHTML = items.length
        ? items
          .map((t) => {
            const conflict =
              t.start_time &&
              data.classes.some(
                (c) =>
                  +c.day === taskDateDay(selected) &&
                  t.start_time < c.end_time &&
                  t.end_time > c.start_time,
              );
            const time = t.start_time
              ? `${fmtTime(t.start_time)}–${fmtTime(t.end_time)}`
              : "All day";
            return `<div class="task-item ${Number(t.completed) ? "done" : ""}"><input class="task-check" type="checkbox" data-task-complete="${esc(t.id)}" ${Number(t.completed) ? "checked" : ""} aria-label="Mark ${esc(t.title)} complete"><div><div class="task-title">${esc(t.title)}</div><div class="task-meta">${esc(time)} · ${esc(t.category)} · <span class="priority-${esc(t.priority)}">${esc(t.priority)} priority</span></div>${t.notes ? `<div class="task-meta">${esc(t.notes)}</div>` : ""}${conflict ? '<div class="task-meta task-conflict">Overlaps a fixed class on this day</div>' : ""}</div><div class="task-actions"><button data-task-edit="${esc(t.id)}" aria-label="Edit task">Edit</button><button class="delete-task" data-task-delete="${esc(t.id)}" aria-label="Delete task">Delete</button></div></div>`;
          })
          .join("")
        : '<div class="empty">No tasks for this date. Add a study session, assignment, reminder or personal activity.</div>';
    }
    function render() {
      data.classes = data.classes || [];
      $("#title").value = data.title || "My CLSU Life Planner";
      $("#semester").value = data.semester || "";
      $("#year").value = data.academic_year || "";
      const hasSchedule = data.classes.length > 0;
      $("#importStart").classList.toggle(
        "hidden",
        hasSchedule && !importPanelOpen,
      );
      $("#updateSchedule").classList.toggle("hidden", !hasSchedule);
      const now = manilaParts(),
      day = manilaDay();
      $("#todayView").classList.toggle("active", viewMode === "today");
      $("#weekView").classList.toggle("active", viewMode === "week");
      $("#heading").textContent =
        viewMode === "today"
          ? "Today · " + (DAYS[day] || "Sunday")
          : "Weekly timetable";
      $("#viewSubheading").textContent =
        viewMode === "today"
          ? "Your class timetable, with a live Philippine-time marker."
          : "This week’s recurring class timetable.";
      $("#calendarPlansHeading").textContent =
        viewMode === "today" ? "Personal plans for today" : "Personal plans this week";
      $("#calendarPlansDescription").textContent =
        "Shown separately from class meetings so overlapping times stay easy to read.";
      $("#timeFormatToggle").textContent = `${timeFormat}-hour`;
      $("#timeFormatToggle").setAttribute(
        "aria-label",
        `Switch to ${timeFormat === "12" ? "24-hour" : "12-hour"} time`,
      );
      $("#timeFormatToggle").setAttribute(
        "aria-pressed",
        String(timeFormat === "24"),
      );
      let g = $("#grid");
      const calendarDays =
        viewMode === "today" ? [day] : [0, 1, 2, 3, 4, 5, 6];
      g.classList.toggle("today-grid", viewMode === "today");
      g.innerHTML =
        '<div class="th">Time</div>' +
        (viewMode === "today"
          ? `<div class="th">${WEEK_DAYS[day]}</div>`
          : WEEK_DAYS.map((x) => `<div class="th">${x}</div>`).join(""));
      let axis = document.createElement("div");
      axis.className = "axis";
      for (let i = 0; i < 24; i++) {
        let d = document.createElement("div");
        d.className = "tick";
        d.textContent = fmtTime(
          `${String(7 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
        );
        axis.append(d);
      }
      g.append(axis);
      calendarDays.forEach((n) => {
        let col = document.createElement("div");
        col.className = "day" + (n === day ? " current-day" : "");
        data.classes
          .filter((c) => +c.day === n)
          .sort((x, y) => x.start_time.localeCompare(y.start_time))
          .forEach((c) => {
            let el = document.createElement("div");
            el.className = "meeting class-meeting";
            el.dataset.start = c.start_time;
            el.dataset.end = c.end_time;
            el.style.top = ((mins(c.start_time) - 420) / 720) * 100 + "%";
            el.style.height =
              Math.max(
                2,
                ((mins(c.end_time) - mins(c.start_time)) / 720) * 100,
              ) + "%";
            let current =
              n === day &&
              mins(now.hour + ":" + now.minute) >= mins(c.start_time) &&
              mins(now.hour + ":" + now.minute) < mins(c.end_time);
            if (current) el.classList.add("current-class");
            el.innerHTML = `<b>${esc(c.subject_code)}</b><br>${fmtTime(c.start_time)}–${fmtTime(c.end_time)}<br>${esc(c.room || "Room TBA")}`;
            el.title = c.subject_name;
            col.append(el);
          });
        if (n === day) {
          let m = mins(now.hour + ":" + now.minute);
          if (m >= 420 && m <= 1140) {
            let marker = document.createElement("div");
            marker.className = "time-marker";
            marker.style.top = ((m - 420) / 720) * 100 + "%";
            col.append(marker);
          }
        }
        g.append(col);
      });
      $("#rows").innerHTML = data.classes
        .map(
          (c) =>
            `<tr><td><b>${esc(c.subject_code)}</b><br>${esc(c.subject_name)}</td><td>${esc(c.section)}</td><td>${esc(c.units)}</td><td>${DAYS[+c.day]}</td><td>${fmtTime(c.start_time)}–${fmtTime(c.end_time)}</td><td>${esc(c.room)}</td><td class="noprint"><button class="btn danger" data-id="${esc(c.id)}">Delete</button></td></tr>`,
        )
        .join("");
      $("#empty").hidden = data.classes.length > 0;
      updateLive(data.classes, now);
      renderPlanner();
    }
    function updateLive(allClasses, now) {
      const hm = mins(now.hour + ":" + now.minute),
        day = manilaDay();
      const classes = allClasses
        .filter((c) => +c.day === day)
        .sort((a, b) => a.start_time.localeCompare(b.start_time));
      const active = classes.find(
        (c) => hm >= mins(c.start_time) && hm < mins(c.end_time),
      );
      const next = allClasses
        .map((c) => {
          const diff = (Number(c.day) - day + 7) % 7,
            daysUntil = diff === 0 && mins(c.start_time) <= hm ? 7 : diff;
          return { ...c, daysUntil };
        })
        .sort(
          (a, b) =>
            a.daysUntil - b.daysUntil ||
            a.start_time.localeCompare(b.start_time),
        )[0];
      $("#liveTime").textContent = new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: timeFormat === "12" ? "h12" : "h23",
      }).format(clockNow());
      $("#liveDate").textContent =
        new Intl.DateTimeFormat("en-PH", {
          timeZone: "Asia/Manila",
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }).format(clockNow()) + " · UTC+8";
      if (active) {
        $("#nextKicker").textContent = "CURRENT CLASS";
        $("#nextTitle").textContent =
          active.subject_code + " · " + active.subject_name;
        const following = next;
        const when = following
          ? following.daysUntil === 0
            ? "today"
            : following.daysUntil === 1
              ? "tomorrow"
              : DAYS[following.day]
          : "No other classes scheduled";
        $("#nextMeta").textContent =
          `Until ${fmtTime(active.end_time)} · ${active.room || "Room TBA"}${following ? " · NEXT: " + following.subject_code + " · " + when + " at " + fmtTime(following.start_time) : ""}`;
      } else if (next) {
        const d = next.daysUntil * 1440 + mins(next.start_time) - hm,
          when =
            next.daysUntil === 0
              ? "Today"
              : next.daysUntil === 1
                ? "Tomorrow"
                : DAYS[next.day];
        $("#nextKicker").textContent = "UP NEXT";
        $("#nextTitle").textContent =
          next.subject_code + " · " + next.subject_name;
        $("#nextMeta").textContent =
          `${when} · ${fmtTime(next.start_time)} · ${Math.floor(d / 60) ? Math.floor(d / 60) + "h " : ""}${d % 60}m away · ${next.room || "Room TBA"}`;
      } else {
        $("#nextKicker").textContent = "NO SCHEDULE";
        $("#nextTitle").textContent = "No classes have been added yet.";
        $("#nextMeta").textContent =
          "Import a CAIS PDF or build your timetable manually.";
      }
      const todayDate = manilaDate(),
        firstDate = viewMode === "today" ? todayDate : weekDate(0),
        lastDate = viewMode === "today" ? todayDate : weekDate(6),
        tasks = (data.tasks || [])
          .filter((task) => task.task_date >= firstDate && task.task_date <= lastDate)
          .sort(
            (a, b) =>
              a.task_date.localeCompare(b.task_date) ||
              (a.start_time || "99:99").localeCompare(b.start_time || "99:99"),
          );
      $("#todayAgenda").innerHTML = tasks.length
        ? tasks
          .map((task) => {
            const conflict = task.start_time
              ? data.classes.find(
                  (c) =>
                    +c.day === taskDateDay(task.task_date) &&
                    task.start_time < c.end_time &&
                    task.end_time > c.start_time,
                )
              : null;
            const dateLabel =
              viewMode === "week"
                ? new Intl.DateTimeFormat("en-PH", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(task.task_date + "T12:00:00Z")) + " · "
                : "";
            const timeLabel = task.start_time
              ? `${fmtTime(task.start_time)}–${fmtTime(task.end_time)}`
              : "All day";
            const state = Number(task.completed)
              ? "DONE"
              : task.task_date > todayDate
                ? "PLANNED"
                : task.task_date < todayDate
                  ? "PAST"
                  : task.start_time && hm >= mins(task.start_time) && hm < mins(task.end_time)
                    ? "NOW"
                    : task.start_time && hm < mins(task.start_time)
                      ? "UPCOMING"
                      : task.start_time
                        ? "PAST"
                        : "PLANNED";
            return `<div class="agenda-item personal-agenda-item${conflict ? " has-conflict" : ""}"><div class="agenda-time">${esc(timeLabel)}</div><div><div class="agenda-subject">${esc(task.title)}</div><div class="agenda-detail">${dateLabel}${esc(task.category)}${task.notes ? " · " + esc(task.notes) : ""}</div><div class="agenda-state">${state}${conflict ? ` · <span class="agenda-conflict">Overlaps ${esc(conflict.subject_code)}</span>` : ""}</div></div></div>`;
          })
          .join("")
        : `<div class="empty">No personal plans scheduled for ${viewMode === "today" ? "today" : "this week"}. Add one in the Personal planner.</div>`;
    }
    function updateMarker(now) {
      const day = manilaDay(),
        hm = mins(now.hour + ":" + now.minute),
        cols = [...document.querySelectorAll("#grid .day")],
        col = viewMode === "today" ? cols[0] : cols[day];
      if (!col) return;
      let marker = col.querySelector(".time-marker");
      if (hm >= 420 && hm <= 1140) {
        if (!marker) {
          marker = document.createElement("div");
          marker.className = "time-marker";
          col.append(marker);
        }
        marker.style.top = ((hm - 420) / 720) * 100 + "%";
      } else if (marker) marker.remove();
      col
        .querySelectorAll(".meeting")
        .forEach((el) =>
          el.classList.toggle(
            "current-class",
            hm >= mins(el.dataset.start) && hm < mins(el.dataset.end),
          ),
        );
    }
    async function refresh() {
      data = await api(displayMode ? "/api/display" : "/api/schedule");
      localStorage.setItem("clsu_schedule_cache", JSON.stringify(data));
      render();
    }
    function showLoading(title, txt) {
      $("#loadingTitle").textContent = title;
      $("#loadingText").textContent = txt;
      $("#loading").classList.remove("hidden");
    }
    function hideLoading() {
      $("#loading").classList.add("hidden");
    }
    function groupTextItems(items) {
      const lines = [];
      for (const it of items) {
        const x = it.transform?.[4] ?? 0,
          y = it.transform?.[5] ?? 0,
          s = (it.str || "").trim();
        if (!s) continue;
        let line = lines.find((l) => Math.abs(l.y - y) < 2.2);
        if (!line) {
          line = { y, items: [] };
          lines.push(line);
        }
        line.items.push({ x, s });
      }
      for (const l of lines) l.items.sort((a, b) => a.x - b.x);
      return lines.sort((a, b) => b.y - a.y);
    }
    function lineValue(line, min, max) {
      return line.items
        .filter((i) => i.x >= min && i.x < max)
        .map((i) => i.s)
        .join(" ")
        .trim();
    }
    function clock24(s, role) {
      const m = s.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) throw Error("Unrecognized time: " + s);
      let h = +m[1],
        mm = +m[2];
      if (h === 12) return `12:${String(mm).padStart(2, "0")}`;
      if (h >= 1 && h <= 6) h += 12;
      return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
    function parseDay(s) {
      const m = s.replace(/_/g, "").trim().toLowerCase();
      return {
        m: 0,
        mon: 0,
        t: 1,
        tu: 1,
        tue: 1,
        w: 2,
        wed: 2,
        th: 3,
        thu: 3,
        f: 4,
        fri: 4,
        s: 5,
        sat: 5,
      }[m];
    }
    function parsePdfLines(lines) {
      const records = [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i],
          subject = lineValue(l, 0, 300),
          section = lineValue(l, 300, 410),
          units = lineValue(l, 410, 460),
          days = lineValue(l, 460, 520),
          times = lineValue(l, 520, 670),
          rooms = lineValue(l, 670, 1000);
        if (!subject || !section || !days || !times) continue;
        if (!/^\d+$/.test(units)) continue;
        const descLine = lines
          .slice(i + 1)
          .find(
            (n) =>
              n.y < l.y &&
              l.y - n.y < 20 &&
              lineValue(n, 0, 300) &&
              !lineValue(n, 300, 1000),
          );
        const name = descLine ? lineValue(descLine, 0, 300) : subject;
        const dayParts = days.split("/").map((x) => x.trim()),
          timeParts = times.split("/").map((x) => x.trim()),
          roomParts = rooms.split("/").map((x) => x.trim());
        if (dayParts.length !== timeParts.length)
          throw Error(
            `The day/time count does not match for ${subject}. Please check this PDF manually.`,
          );
        dayParts.forEach((d, j) => {
          const day = parseDay(d);
          if (day === undefined)
            throw Error(`Unrecognized weekday "${d}" for ${subject}.`);
          const tm = timeParts[j].match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
          if (!tm)
            throw Error(
              `Unrecognized time range "${timeParts[j]}" for ${subject}.`,
            );
          const start_time = clock24(tm[1], "start"),
            end_time = clock24(tm[2], "end");
          if (start_time >= end_time)
            throw Error(
              `Invalid time range for ${subject}: ${timeParts[j]}.`,
            );
          records.push({
            subject_code: subject,
            subject_name: name,
            section,
            units: Number(units),
            day,
            start_time,
            end_time,
            room: roomParts[j] || roomParts[0] || "",
          });
        });
      }
      if (!records.length)
        throw Error(
          "No schedule rows were detected. Make sure this is the CAIS Class Schedule registration-form PDF, not a screenshot or scanned document.",
        );
      return records;
    }
    async function readCaisPdf(file) {
      if (
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
      )
        throw Error("Choose a PDF file.");
      if (file.size > 15 * 1024 * 1024)
        throw Error("PDF is too large. Maximum size is 15 MB.");
      const pdfjs =
        await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
      const bytes = await file.arrayBuffer(),
        pdf = await pdfjs.getDocument({ data: bytes }).promise;
      let allLines = [],
        fullText = "";
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n),
          content = await page.getTextContent();
        const lines = groupTextItems(content.items);
        allLines.push(...lines);
        fullText +=
          " " + lines.map((l) => l.items.map((i) => i.s).join(" ")).join(" ");
      }
      const semester =
        (fullText.match(/(\d+(?:ST|ND|RD|TH)\s+SEMESTER)/i) || [])[1] || "",
        year =
          (fullText.match(/A\.?Y\.?\s*(\d{4}\s*[-–]\s*\d{4})/i) || [])[1] ||
          "";
      const page2 = await pdf.getPage(pdf.numPages),
        content = await page2.getTextContent(),
        records = parsePdfLines(groupTextItems(content.items));
      return { records, semester, year, pages: pdf.numPages };
    }
    function showReview(result, file) {
      pendingImport = result.records;
      $("#pdfMeta").textContent =
        `${file.name} · ${result.pages} page(s)${result.semester ? " · " + result.semester : ""}${result.year ? " · A.Y. " + result.year : ""}`;
      $("#reviewSummary").innerHTML =
        `<span class="pill">${result.records.length} class meetings</span><span class="pill">${new Set(result.records.map((c) => c.subject_code)).size} subjects</span><span class="pill">${result.pages} PDF pages</span>`;
      $("#previewRows").innerHTML = result.records
        .map(
          (c) =>
            `<tr><td><b>${esc(c.subject_code)}</b><br>${esc(c.subject_name)}</td><td>${DAYS[c.day]}</td><td>${c.start_time}–${c.end_time}</td><td>${esc(c.room)}</td><td>${c.units}</td></tr>`,
        )
        .join("");
      $("#replaceExisting").checked = true;
      $("#reviewCard").classList.remove("hidden");
      $("#reviewCard").scrollIntoView({ behavior: "smooth", block: "start" });
      if (result.semester) $("#semester").value = result.semester;
      if (result.year) $("#year").value = result.year;
    }
    $("#taskDate").value = manilaDate();
    $("#taskDateForm").value = manilaDate();
    $("#taskDate").onchange = () => {
      $("#taskDateForm").value = $("#taskDate").value;
      renderPlanner();
    };
    $("#taskForm").onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target),
        task = Object.fromEntries(f);
      task.completed = editingTaskId
        ? !!Number(data.tasks.find((t) => t.id === editingTaskId)?.completed)
        : false;
      if (
        (task.start_time && !task.end_time) ||
        (!task.start_time && task.end_time)
      ) {
        alert("Enter both a start and end time, or leave both blank.");
        return;
      }
      if (
        task.start_time &&
        task.end_time &&
        task.start_time >= task.end_time
      ) {
        alert("End time must be later than start time.");
        return;
      }
      try {
        showLoading(
          "Saving planner task",
          "Adding this activity to your private planner.",
        );
        data = await api(
          editingTaskId ? "/api/tasks/" + editingTaskId : "/api/tasks",
          {
            method: editingTaskId ? "PUT" : "POST",
            body: JSON.stringify(task),
          },
        );
        $("#taskDate").value = task.task_date;
        editingTaskId = null;
        e.target.reset();
        $("#taskDateForm").value = $("#taskDate").value;
        $("#taskSubmit").textContent = "Add to planner";
        $("#cancelTaskEdit").classList.add("hidden");
        render();
        hideLoading();
        say("Planner task saved");
      } catch (err) {
        hideLoading();
        alert(err.message);
      }
    };
    $("#cancelTaskEdit").onclick = () => {
      editingTaskId = null;
      $("#taskForm").reset();
      $("#taskDateForm").value = $("#taskDate").value;
      $("#taskSubmit").textContent = "Add to planner";
      $("#cancelTaskEdit").classList.add("hidden");
    };
    $("#taskList").onchange = async (e) => {
      const id = e.target.dataset.taskComplete;
      if (!id) return;
      try {
        data = await api("/api/tasks/" + id + "/complete", {
          method: "PATCH",
          body: JSON.stringify({ completed: e.target.checked }),
        });
        render();
      } catch (err) {
        alert(err.message);
      }
    };
    $("#taskList").onclick = async (e) => {
      const editId = e.target.dataset.taskEdit;
      if (editId) {
        const t = data.tasks.find((x) => x.id === editId);
        if (!t) return;
        editingTaskId = editId;
        for (const [k, v] of Object.entries({
          title: t.title,
          task_date: t.task_date,
          category: t.category,
          start_time: t.start_time || "",
          end_time: t.end_time || "",
          priority: t.priority,
          notes: t.notes || "",
        }))
          $("#taskForm").elements[k].value = v;
        $("#taskSubmit").textContent = "Save changes";
        $("#cancelTaskEdit").classList.remove("hidden");
        $("#taskForm").scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        return;
      }
      const id = e.target.dataset.taskDelete;
      if (!id) return;
      if (!confirm("Delete this planner task?")) return;
      try {
        data = await api("/api/tasks/" + id, { method: "DELETE" });
        render();
      } catch (err) {
        alert(err.message);
      }
    };
    $("#updateSchedule").onclick = () => {
      importPanelOpen = !importPanelOpen;
      render();
      if (importPanelOpen)
        $("#importStart").scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    };
    $("#todayView").onclick = () => {
      viewMode = "today";
      render();
    };
    $("#weekView").onclick = () => {
      viewMode = "week";
      render();
    };
    $("#timeFormatToggle").onclick = () => {
      timeFormat = timeFormat === "12" ? "24" : "12";
      localStorage.setItem("clsu_time_format", timeFormat);
      render();
    };
    $("#jumpNow").onclick = () => {
      const columns = [...document.querySelectorAll("#grid .day")];
      const column =
        viewMode === "today" ? columns[0] : columns[manilaDay()];
      const marker = column?.querySelector(".time-marker");
      if (!column || !marker) return;
      const scroll = $(".gridscroll");
      const markerTop =
        column.offsetTop +
        (parseFloat(marker.style.top) / 100) * column.offsetHeight;
      scroll.scrollTo({
        top: Math.max(0, markerTop - 110),
        left:
          viewMode === "week"
            ? Math.max(0, column.offsetLeft - scroll.clientWidth / 3)
            : 0,
        behavior: "smooth",
      });
    };
    $("#manualStart").onclick = () => {
      $("#manualCard").scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      $("#add").querySelector("input[name=subject_code]").focus();
    };
    $("#choosePdf").onclick = () => $("#pdfFile").click();
    $("#pdfFile").onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        showLoading(
          "Reading your CAIS PDF",
          "Extracting subjects, meeting days, times and rooms locally in your browser.",
        );
        const result = await readCaisPdf(file);
        hideLoading();
        showReview(result, file);
      } catch (err) {
        hideLoading();
        alert(err.message || "Could not read this PDF.");
      } finally {
        e.target.value = "";
      }
    };
    $("#cancelReview").onclick = () => {
      $("#reviewCard").classList.add("hidden");
      pendingImport = [];
    };
    $("#confirmImport").onclick = async () => {
      if (!pendingImport.length) return;
      try {
        showLoading(
          "Importing your schedule",
          "Saving the reviewed class meetings to your private device schedule.",
        );
        const next = await api("/api/import", {
          method: "POST",
          body: JSON.stringify({
            classes: pendingImport,
            replace: $("#replaceExisting").checked,
            semester: $("#semester").value,
            academic_year: $("#year").value,
          }),
        });
        data = next;
        importPanelOpen = false;
        render();
        $("#reviewCard").classList.add("hidden");
        pendingImport = [];
        say("Schedule imported");
        hideLoading();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (err) {
        hideLoading();
        alert(err.message);
      }
    };
    $("#add").onsubmit = async (e) => {
      e.preventDefault();
      let x = Object.fromEntries(new FormData(e.target));
      x.day = +x.day;
      x.units = +x.units;
      try {
        data = await api("/api/classes", {
          method: "POST",
          body: JSON.stringify(x),
        });
        render();
        e.target.reset();
        say("Saved");
      } catch (err) {
        alert(err.message);
      }
    };
    $("#rows").onclick = async (e) => {
      if (!e.target.dataset.id) return;
      if (confirm("Delete this class meeting?")) {
        data = await api("/api/classes/" + e.target.dataset.id, {
          method: "DELETE",
        });
        render();
      }
    };
    $("#saveMeta").onclick = async () => {
      try {
        data = await api("/api/schedule", {
          method: "PUT",
          body: JSON.stringify({
            title: $("#title").value,
            semester: $("#semester").value,
            academic_year: $("#year").value,
          }),
        });
        render();
        say("Saved");
      } catch (e) {
        alert(e.message);
      }
    };
    $("#clear").onclick = async () => {
      if (confirm("Delete all class meetings?")) {
        data = await api("/api/classes", { method: "DELETE" });
        render();
      }
    };
    function download(n, t, type) {
      let a = document.createElement("a"),
        u = URL.createObjectURL(new Blob([t], { type }));
      a.href = u;
      a.download = n;
      a.click();
      URL.revokeObjectURL(u);
    }
    $("#jsonOut").onclick = () =>
      download(
        "clsu-schedule.json",
        JSON.stringify(
          {
            title: data.title,
            semester: data.semester,
            academic_year: data.academic_year,
            classes: data.classes.map(({ id, ...x }) => x),
            tasks: (data.tasks || []).map(({ id, ...x }) => x),
          },
          null,
          2,
        ),
        "application/json",
      );
    $("#csvOut").onclick = () => {
      let keys = [
        "subject_code",
        "subject_name",
        "section",
        "day",
        "start_time",
        "end_time",
        "room",
        "units",
      ],
        q = (v) => {
          let text = String(v ?? "");
          if (/^[\u0000-\u0020\u007f-\u009f]*[=+\-@]/.test(text))
            text = "'" + text;
          return '"' + text.replace(/"/g, '""') + '"';
        };
      download(
        "clsu-schedule.csv",
        [
          keys.join(","),
          ...data.classes.map((c) =>
            keys.map((k) => q(k === "day" ? DAYS[+c[k]] : c[k])).join(","),
          ),
        ].join("\r\n"),
        "text/csv",
      );
    };
    function csv(t) {
      let lines = t
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter(Boolean);
      let parse = (s) => {
        let a = [],
          v = "",
          q = false;
        for (let i = 0; i < s.length; i++) {
          let c = s[i];
          if (c === '"' && q && s[i + 1] === '"') {
            v += '"';
            i++;
          } else if (c === '"') q = !q;
          else if (c === "," && !q) {
            a.push(v);
            v = "";
          } else v += c;
        }
        a.push(v);
        return a;
      };
      let h = parse(lines[0]);
      return lines.slice(1).map((l) => {
        let vals = parse(l);
        return Object.fromEntries(
          h.map((k, i) => [
            k,
            (vals[i] || "").replace(
              /^'(?=[\u0000-\u0020\u007f-\u009f]*[=+\-@])/,
              "",
            ),
          ]),
        );
      });
    }
    $("#file").onchange = async (e) => {
      let f = e.target.files[0];
      if (!f) return;
      try {
        let raw = f.name.endsWith(".csv")
          ? csv(await f.text())
          : JSON.parse(await f.text()),
          items = Array.isArray(raw) ? raw : raw.classes;
        if (!Array.isArray(items)) throw Error("Expected classes array");
        let classes = items.map((c) => ({
          ...c,
          day:
            typeof c.day === "string" && !/^\d+$/.test(c.day)
              ? DAYS.findIndex((d) => d.toLowerCase() === c.day.toLowerCase())
              : +c.day,
          start_time: c.start_time || c.start,
          end_time: c.end_time || c.end,
        }));
        let hasTasks = Array.isArray(raw.tasks),
          tasks = hasTasks ? raw.tasks : [];
        if (
          !confirm(
            `Import ${classes.length} class meeting(s) and ${tasks.length} planner task(s)?`,
          )
        )
          return;
        data = await api("/api/import", {
          method: "POST",
          body: JSON.stringify({ classes, tasks, replace_tasks: hasTasks }),
        });
        render();
        say("Imported");
      } catch (err) {
        alert(err.message);
      } finally {
        e.target.value = "";
      }
    };
    (async () => {
      try {
        const cachedBeforeSession = localStorage.getItem(
          "clsu_schedule_cache",
        );
        const recoveryKey = "clsu_schedule_recovery_cache";
        const session = await api("/api/session");
        let recovery = localStorage.getItem(recoveryKey);
        if (session.deviceReset && cachedBeforeSession && !recovery) {
          recovery = cachedBeforeSession;
          localStorage.setItem(recoveryKey, recovery);
        }
        let restored = false;
        if (recovery) {
          let previous;
          try {
            previous = JSON.parse(recovery);
          } catch {
            alert(
              "The local recovery copy could not be read. It remains saved in this browser.",
            );
          }
          if (
            previous &&
            Array.isArray(previous.classes) &&
            (previous.tasks === undefined ||
              Array.isArray(previous.tasks)) &&
            confirm(
              "For security, the previous device cookie was replaced. Restore the schedule cached on this browser to the new private device session?",
            )
          ) {
            await api("/api/import", {
              method: "POST",
              body: JSON.stringify({
                classes: previous.classes,
                tasks: Array.isArray(previous.tasks) ? previous.tasks : [],
                semester: previous.semester,
                academic_year: previous.academic_year,
                replace: true,
                replace_tasks: true,
              }),
            });
            localStorage.removeItem(recoveryKey);
            restored = true;
          }
        }
        await refresh();
        say(
          restored
            ? "Local schedule restored · synced"
            : session.deviceReset
              ? "Security update reset this device session"
              : "Private device schedule · synced",
        );
      } catch (e) {
        const cached = localStorage.getItem("clsu_schedule_cache");
        if (cached) {
          try {
            data = JSON.parse(cached);
            render();
            say("Offline · showing last saved schedule");
            $("#liveState").textContent =
              "Offline view · schedule may be outdated";
          } catch {
            say("Could not read offline schedule");
          }
        } else {
          render();
          say("Connect to load or create your schedule");
          $("#liveState").textContent = "No saved schedule on this device";
        }
      }
    })();
    let previousManilaDay = manilaDay(),
      previousManilaDate = manilaDate();
    setInterval(() => {
      if (!data || !data.classes) return;
      const now = manilaParts(),
        day = manilaDay(),
        date = manilaDate();
      if (date !== previousManilaDate) {
        if ($("#taskDate").value === previousManilaDate)
          $("#taskDate").value = date;
        previousManilaDate = date;
        previousManilaDay = day;
        render();
      } else if (day !== previousManilaDay) {
        previousManilaDay = day;
        render();
      } else {
        updateLive(data.classes, now);
        updateMarker(now);
      }
    }, 1000);
    setInterval(async () => {
      if (
        !displayMode ||
        document.visibilityState !== "visible" ||
        !navigator.onLine
      )
        return;
      try {
        await refresh();
        $("#liveState").textContent = "Live view · refreshed just now";
      } catch {
        $("#liveState").textContent = "Offline · showing the last saved schedule";
      }
    }, 30000);
    let installPrompt = null;
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      installPrompt = e;
    });
    $("#installApp").onclick = async () => {
      if (!installPrompt) {
        openDialog("installHelpDialog");
        return;
      }
      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        installPrompt = null;
        if (choice.outcome === "accepted")
          $("#installApp").classList.add("hidden");
      } catch {
        installPrompt = null;
        openDialog("installHelpDialog");
      }
    };
    window.addEventListener("appinstalled", () =>
      $("#installApp").classList.add("hidden"),
    );
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      navigator.standalone
    )
      $("#installApp").classList.add("hidden");
    if ("serviceWorker" in navigator)
      window.addEventListener("load", () =>
        navigator.serviceWorker
          .register("/service-worker.js")
          .catch(() => {
            $("#liveState").textContent =
              "Offline app support could not be enabled in this browser.";
          }),
      );
    const themeToggle = $("#themeToggle");
    const guideImage = $("#guideGif");
    guideImage.addEventListener("error", () => {
      if (guideImage.src.endsWith(GUIDE_ASSETS.fallback)) return;
      guideImage.dataset.usingFallback = "true";
      guideImage.src = GUIDE_ASSETS.fallback;
    });
    let guideRequest = 0;
    async function updateGuideTheme(theme) {
      const request = ++guideRequest,
        source = GUIDE_ASSETS[theme] || GUIDE_ASSETS.light;
      $("#guideThemeLabel").textContent = `${theme.toUpperCase()} GUIDE`;
      if (request !== guideRequest) return;
      guideImage.dataset.usingFallback = "false";
      guideImage.dataset.theme = theme;
      guideImage.src = source;
    }
    function setTheme(theme) {
      document.documentElement.dataset.theme = theme;
      document.querySelector("meta[name=theme-color]").content =
        theme === "dark" ? "#15131d" : "#385344";
      themeToggle.textContent = theme === "dark" ? "Light mode" : "Dark mode";
      themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
      themeToggle.title = `Switch to ${theme === "dark" ? "light" : "dark"} appearance`;
      localStorage.setItem("clsu_theme", theme);
      updateGuideTheme(theme);
    }
    setTheme(document.documentElement.dataset.theme);
    themeToggle.onclick = () =>
      setTheme(
        document.documentElement.dataset.theme === "dark" ? "light" : "dark",
      );
    function openDialog(id) {
      const dialog = document.getElementById(id);
      if (!dialog.open) dialog.showModal();
    }
    $("#manualStart").onclick = $("#manualStartHero").onclick = () => {
      openDialog("manualDialog");
      $("#add").querySelector("input[name=subject_code]").focus();
    };
    $("#backupStart").onclick = () => openDialog("backupDialog");
    document
      .querySelectorAll("[data-close-dialog]")
      .forEach(
        (button) =>
        (button.onclick = () =>
          document.getElementById(button.dataset.closeDialog).close()),
      );
    document.querySelectorAll(".modal").forEach((dialog) =>
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      }),
    );
    const originalAddHandler = $("#add").onsubmit;
    $("#add").onsubmit = async (event) => {
      const previousCount = data.classes.length;
      await originalAddHandler(event);
      if (data.classes.length > previousCount) {
        $("#manualDialog").close();
        $("#manualStart").focus();
      }
    };
    const originalImportHandler = $("#file").onchange;
    $("#file").onchange = async (event) => {
      const previousData = data;
      await originalImportHandler(event);
      if (data !== previousData) $("#backupDialog").close();
    };
    const originalClearHandler = $("#clear").onclick;
    $("#clear").onclick = async () => {
      const previousData = data;
      await originalClearHandler();
      if (data !== previousData) $("#backupDialog").close();
    };
    const fullscreenButton = $("#fullscreenToggle"),
      scheduleCard = $("#scheduleCard");
    async function setScheduleFullscreen(fullscreen, native = true) {
      if (
        fullscreen &&
        native &&
        scheduleCard.requestFullscreen &&
        !document.fullscreenElement
      ) {
        try {
          await scheduleCard.requestFullscreen();
        } catch {
          // Retain the CSS full-screen fallback when native full-screen is unavailable.
        }
      } else if (
        !fullscreen &&
        document.fullscreenElement === scheduleCard &&
        document.exitFullscreen
      ) {
        try {
          await document.exitFullscreen();
        } catch {
          // The CSS state below still allows the user to leave full-screen mode.
        }
      }
      scheduleCard.classList.toggle("schedule-fullscreen", fullscreen);
      document.body.classList.toggle("has-fullscreen-schedule", fullscreen);
      fullscreenButton.textContent = fullscreen
        ? "Exit full screen"
        : "Full screen";
      fullscreenButton.setAttribute("aria-pressed", String(fullscreen));
      if (fullscreen) scheduleCard.scrollTop = 0;
    }
    fullscreenButton.onclick = () =>
      setScheduleFullscreen(
        !scheduleCard.classList.contains("schedule-fullscreen"),
      );
    document.addEventListener("fullscreenchange", () => {
      const fullscreen = document.fullscreenElement === scheduleCard;
      if (fullscreen) {
        scheduleCard.classList.add("schedule-fullscreen");
        document.body.classList.add("has-fullscreen-schedule");
        fullscreenButton.textContent = "Exit full screen";
        fullscreenButton.setAttribute("aria-pressed", "true");
      } else if (scheduleCard.classList.contains("schedule-fullscreen")) {
        scheduleCard.classList.remove("schedule-fullscreen");
        document.body.classList.remove("has-fullscreen-schedule");
        fullscreenButton.textContent = "Full screen";
        fullscreenButton.setAttribute("aria-pressed", "false");
      }
    });
    window.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        !document.querySelector("dialog[open]") &&
        scheduleCard.classList.contains("schedule-fullscreen")
      )
        setScheduleFullscreen(false);
    });
    let classSort = { key: "day", direction: "asc" };
    function renderClassRows() {
      const query = $("#classSearch").value.trim().toLocaleLowerCase();
      const classes = (data.classes || []).filter((c) =>
        [
          c.subject_code,
          c.subject_name,
          c.section,
          c.units,
          DAYS[+c.day],
          c.start_time,
          c.end_time,
          c.room,
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query),
      );
      const compare = (a, b, key) =>
        key === "day" || key === "units"
          ? Number(a[key] || 0) - Number(b[key] || 0)
          : String(a[key] || "").localeCompare(
            String(b[key] || ""),
            undefined,
            { numeric: true, sensitivity: "base" },
          );
      classes.sort((a, b) => {
        const order =
          compare(a, b, classSort.key) *
          (classSort.direction === "asc" ? 1 : -1);
        return (
          order ||
          (classSort.key === "day"
            ? a.start_time.localeCompare(b.start_time)
            : 0)
        );
      });
      $("#rows").innerHTML = classes
        .map(
          (c) =>
            `<tr><td><b>${esc(c.subject_code)}</b><br>${esc(c.subject_name)}</td><td>${esc(c.section)}</td><td>${esc(c.units)}</td><td>${DAYS[+c.day]}</td><td>${fmtTime(c.start_time)}–${fmtTime(c.end_time)}</td><td>${esc(c.room)}</td><td class="noprint"><button class="btn danger" data-id="${esc(c.id)}">Delete</button></td></tr>`,
        )
        .join("");
      $("#classCount").textContent =
        `· ${data.classes.length} meeting${data.classes.length === 1 ? "" : "s"}`;
      $("#empty").hidden = classes.length > 0;
      $("#empty").textContent = query
        ? "No class meetings match your search."
        : "No classes yet. Import a CAIS PDF or add a class meeting.";
      document.querySelectorAll(".sort-button").forEach((button) => {
        const th = button.closest("th"),
          active = button.dataset.sort === classSort.key;
        th.setAttribute(
          "aria-sort",
          active
            ? classSort.direction === "asc"
              ? "ascending"
              : "descending"
            : "none",
        );
        button.textContent =
          button.textContent.replace(/[↕▲▼]$/, "") +
          (active ? (classSort.direction === "asc" ? " ▲" : " ▼") : " ↕");
      });
    }
    const originalRender = render;
    render = function () {
      originalRender();
      $("#importStart").classList.remove("hidden");
      renderClassRows();
      updateMarker(manilaParts());
    };
    const originalRenderPlanner = renderPlanner;
    renderPlanner = function () {
      originalRenderPlanner();
      const count = (data.tasks || []).length;
      $("#plannerSummary").textContent = count
        ? `${count} saved task${count === 1 ? "" : "s"}`
        : "Add a study session, assignment, or reminder";
    };
    $("#classSearch").oninput = renderClassRows;
    document.querySelectorAll(".sort-button").forEach(
      (button) =>
      (button.onclick = () => {
        const key = button.dataset.sort;
        classSort = {
          key,
          direction:
            classSort.key === key && classSort.direction === "asc"
              ? "desc"
              : "asc",
        };
        renderClassRows();
      }),
    );
    $("#detailsToggle").onclick = () => {
      const expanded =
        $("#detailsToggle").getAttribute("aria-expanded") !== "true";
      $("#detailsToggle").setAttribute("aria-expanded", String(expanded));
      $("#scheduleTableWrap").classList.toggle("expanded", expanded);
      $("#detailsToggle").textContent = expanded ? "Show less" : "Show all";
    };
    $("#plannerToggle").onclick = () => {
      const expanded =
        $("#plannerToggle").getAttribute("aria-expanded") !== "true";
      $("#plannerToggle").setAttribute("aria-expanded", String(expanded));
      $("#plannerContent").hidden = !expanded;
      $("#plannerToggleLabel").textContent = expanded ? "Collapse" : "Expand";
    };
    $("#updateSchedule").onclick = () =>
      $("#importStart").scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    updateMarker = function (now) {
      const day = manilaDay(),
        hm = mins(now.hour + ":" + now.minute),
        cols = [...document.querySelectorAll("#grid .day")],
        col = viewMode === "today" ? cols[0] : cols[day];
      if (!col) return;
      let marker = col.querySelector(".time-marker");
      if (!marker) {
        marker = document.createElement("div");
        marker.className = "time-marker";
        col.append(marker);
      }
      const clamped = Math.max(420, Math.min(1140, hm));
      marker.style.top = ((clamped - 420) / 720) * 100 + "%";
      marker.dataset.time =
        hm < 420
          ? "Before 7 AM"
          : hm > 1140
            ? "After 7 PM"
            : fmtTime(now.hour + ":" + now.minute);
      col
        .querySelectorAll(".meeting")
        .forEach((el) =>
          el.classList.toggle(
            "current-class",
            hm >= mins(el.dataset.start) && hm < mins(el.dataset.end),
          ),
        );
    };