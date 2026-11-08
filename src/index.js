const COOKIE = "__Host-clsu_device";
const LEGACY_COOKIE = "clsu_device";
const SECURITY_HEADERS = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy":
    "camera=(), microphone=(), geolocation=(), fullscreen=(self)",
};
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-server-time": String(Date.now()),
      ...headers,
    },
  });
async function secureResponse(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS))
    headers.set(name, value);
  if ((headers.get("content-type") || "").includes("text/html")) {
    headers.set(
      "content-security-policy",
      [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'self'",
        "form-action 'self'",
        "script-src 'self' https://cdnjs.cloudflare.com",
        "script-src-attr 'none'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self' https://cdnjs.cloudflare.com",
        "worker-src 'self' blob: https://cdnjs.cloudflare.com",
        "manifest-src 'self'",
      ].join("; "),
    );
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
function cookie(req, name) {
  for (const p of (req.headers.get("Cookie") || "").split(";")) {
    const [k, ...v] = p.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}
async function guideAsset(req, env) {
  const theme = new URL(req.url).pathname.endsWith("_dark.gif")
    ? "dark"
    : "light";
  return env.ASSETS.fetch(
    new Request(new URL(`/assets/guide-${theme}.gif`, req.url), req),
  );
}
async function hash(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
function token() {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
const validTime = (s) =>
  typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
function validate(c) {
  if (!c || typeof c !== "object") return "Invalid class";
  if (
    !String(c.subject_code || "").trim() ||
    !String(c.subject_name || "").trim()
  )
    return "Subject code and name are required";
  if (
    !Number.isInteger(Number(c.day)) ||
    Number(c.day) < 0 ||
    Number(c.day) > 5
  )
    return "Day must be 0–5 (Monday–Saturday)";
  if (
    !validTime(c.start_time) ||
    !validTime(c.end_time) ||
    c.start_time >= c.end_time
  )
    return "Invalid class time";
  if (
    !Number.isInteger(Number(c.units ?? 0)) ||
    Number(c.units ?? 0) < 0 ||
    Number(c.units ?? 0) > 30
  )
    return "Units must be 0–30";
  return null;
}
async function deviceFor(req, env) {
  const primary = cookie(req, COOKIE),
    legacy = cookie(req, LEGACY_COOKIE);
  if (primary && /^[a-f0-9]{64}$/.test(primary)) {
    const t = primary;
    const id = await hash(t);
    let row = await env.DB.prepare(
      "SELECT id FROM anonymous_devices WHERE id=?",
    )
      .bind(id)
      .first();
    if (row) {
      await env.DB.prepare(
        "UPDATE anonymous_devices SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?",
      )
        .bind(id)
        .run();
      return {
        id,
        set: null,
        clearLegacy: Boolean(legacy),
        deviceReset: false,
      };
    }
  }
  const t = token();
  const id = await hash(t);
  await env.DB.prepare("INSERT INTO anonymous_devices(id) VALUES(?)")
    .bind(id)
    .run();
  return {
    id,
    set: `${COOKIE}=${t}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`,
    clearLegacy: Boolean(legacy),
    deviceReset: Boolean(legacy),
  };
}
async function schedule(env, device) {
  let s = await env.DB.prepare(
    "SELECT id,title,semester,academic_year FROM schedules WHERE device_id=? ORDER BY created_at LIMIT 1",
  )
    .bind(device)
    .first();
  if (!s) {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO schedules(id,device_id,title) VALUES(?,?,'My CLSU Life Planner')",
    )
      .bind(id, device)
      .run();
    s = { id, title: "My CLSU Life Planner", semester: "", academic_year: "" };
  }
  const { results } = await env.DB.prepare(
    "SELECT id,subject_code,subject_name,section,day,start_time,end_time,room,units FROM classes WHERE schedule_id=? ORDER BY day,start_time",
  )
    .bind(s.id)
    .all();
  const tasks = await env.DB.prepare(
    "SELECT id,title,notes,task_date,start_time,end_time,category,priority,completed FROM planner_tasks WHERE schedule_id=? ORDER BY task_date,COALESCE(start_time,'99:99'),created_at",
  )
    .bind(s.id)
    .all();
  return { ...s, classes: results, tasks: tasks.results };
}
async function displaySchedule(env, device) {
  const s = await env.DB.prepare(
    "SELECT id,title,semester,academic_year FROM schedules WHERE device_id=? ORDER BY created_at LIMIT 1",
  )
    .bind(device)
    .first();
  if (!s)
    return {
      title: "My CLSU Life Planner",
      semester: "",
      academic_year: "",
      classes: [],
      tasks: [],
    };
  const classes = await env.DB.prepare(
    "SELECT subject_code,subject_name,section,day,start_time,end_time,room FROM classes WHERE schedule_id=? ORDER BY day,start_time",
  )
    .bind(s.id)
    .all();
  const tasks = await env.DB.prepare(
    "SELECT title,notes,task_date,start_time,end_time,category,completed FROM planner_tasks WHERE schedule_id=? ORDER BY task_date,COALESCE(start_time,'99:99'),created_at",
  )
    .bind(s.id)
    .all();
  return {
    title: s.title,
    semester: s.semester,
    academic_year: s.academic_year,
    classes: classes.results,
    tasks: tasks.results,
  };
}
function validateTask(t) {
  if (!t || typeof t !== "object") return "Invalid task";
  if (!String(t.title || "").trim()) return "Task title is required";
  if (String(t.title).trim().length > 120)
    return "Task title must be 120 characters or fewer";
  if (
    typeof t.task_date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(t.task_date) ||
    Number.isNaN(Date.parse(t.task_date + "T00:00:00Z")) ||
    new Date(t.task_date + "T00:00:00Z").toISOString().slice(0, 10) !==
      t.task_date
  )
    return "Choose a valid task date";
  const hasStart = !!t.start_time,
    hasEnd = !!t.end_time;
  if (hasStart !== hasEnd)
    return "Provide both a start and end time, or leave both blank";
  if (
    hasStart &&
    (!validTime(t.start_time) ||
      !validTime(t.end_time) ||
      t.start_time >= t.end_time)
  )
    return "Task end time must be later than its start time";
  if (
    !["Study", "Assignment", "Personal", "Reminder", "Organization"].includes(
      t.category || "Personal",
    )
  )
    return "Invalid task category";
  if (!["low", "normal", "high"].includes(t.priority || "normal"))
    return "Invalid task priority";
  if (
    t.completed !== undefined &&
    typeof t.completed !== "boolean" &&
    t.completed !== 0 &&
    t.completed !== 1
  )
    return "Invalid completion state";
  return null;
}
async function api(req, env) {
  const u = new URL(req.url),
    p = u.pathname,
    m = req.method,
    maintenance = env.MAINTENANCE_MODE === "true";
  if (m === "GET" && p === "/api/status")
    return json({ maintenance });
  if (
    maintenance &&
    !(m === "GET" && p === "/api/display")
  )
    return json(
      { error: "The planner is in read-only maintenance mode" },
      503,
      { "retry-after": "300" },
    );
  if (
    m !== "GET" &&
    req.headers.get("Origin") &&
    req.headers.get("Origin") !== u.origin
  )
    return json({ error: "Origin rejected" }, 403);
  if (m === "GET" && p === "/api/session") {
    const d = await deviceFor(req, env),
      s = await schedule(env, d.id);
    const response = json(
      { anonymous: true, deviceReset: d.deviceReset, schedule: s },
      200,
      d.set ? { "set-cookie": d.set } : {},
    );
    if (d.clearLegacy)
      response.headers.append(
        "set-cookie",
        `${LEGACY_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      );
    return response;
  }
  const t = cookie(req, COOKIE);
  if (!t || !/^[a-f0-9]{64}$/.test(t))
    return json({ error: "Device session missing; reload" }, 401);
  const id = await hash(t);
  if (
    !(await env.DB.prepare("SELECT id FROM anonymous_devices WHERE id=?")
      .bind(id)
      .first())
  )
    return json({ error: "Device session expired; reload" }, 401);
  if (m === "GET" && p === "/api/display")
    return json(await displaySchedule(env, id));
  const s = await schedule(env, id);
  if (m === "GET" && p === "/api/schedule") return json(s);
  if (m === "PUT" && p === "/api/schedule") {
    let b;
    try {
      b = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    await env.DB.prepare(
      "UPDATE schedules SET title=?,semester=?,academic_year=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND device_id=?",
    )
      .bind(
        String(b.title || "My CLSU Life Planner").slice(0, 100),
        String(b.semester || "").slice(0, 80),
        String(b.academic_year || "").slice(0, 40),
        s.id,
        id,
      )
      .run();
    return json(await schedule(env, id));
  }
  if (m === "POST" && p === "/api/classes") {
    let c;
    try {
      c = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const e = validate(c);
    if (e) return json({ error: e }, 400);
    await env.DB.prepare(
      "INSERT INTO classes(id,schedule_id,subject_code,subject_name,section,day,start_time,end_time,room,units) VALUES(?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        crypto.randomUUID(),
        s.id,
        String(c.subject_code).trim(),
        String(c.subject_name).trim(),
        String(c.section || ""),
        Number(c.day),
        c.start_time,
        c.end_time,
        String(c.room || ""),
        Number(c.units || 0),
      )
      .run();
    return json(await schedule(env, id), 201);
  }
  if (m === "DELETE" && p === "/api/classes") {
    await env.DB.prepare("DELETE FROM classes WHERE schedule_id=?")
      .bind(s.id)
      .run();
    return json(await schedule(env, id));
  }
  if (m === "DELETE" && p.startsWith("/api/classes/")) {
    const cid = p.slice(13);
    await env.DB.prepare("DELETE FROM classes WHERE id=? AND schedule_id=?")
      .bind(cid, s.id)
      .run();
    return json(await schedule(env, id));
  }
  if (m === "POST" && p === "/api/import") {
    let b;
    try {
      b = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (!Array.isArray(b.classes) || b.classes.length > 150)
      return json({ error: "Expected classes array (max 150)" }, 400);
    const errors = b.classes
      .map((c, i) => ({ row: i + 1, error: validate(c) }))
      .filter((x) => x.error);
    if (errors.length)
      return json({ error: "Import validation failed", details: errors }, 400);
    if (
      b.tasks !== undefined &&
      (!Array.isArray(b.tasks) || b.tasks.length > 500)
    )
      return json({ error: "Tasks must be an array (max 500)" }, 400);
    const taskErrors = (b.tasks || [])
      .map((t, i) => ({ row: i + 1, error: validateTask(t) }))
      .filter((x) => x.error);
    if (taskErrors.length)
      return json(
        { error: "Task import validation failed", details: taskErrors },
        400,
      );
    const stmts = b.classes.map((c) =>
      env.DB.prepare(
        "INSERT INTO classes(id,schedule_id,subject_code,subject_name,section,day,start_time,end_time,room,units) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ).bind(
        crypto.randomUUID(),
        s.id,
        String(c.subject_code).trim(),
        String(c.subject_name).trim(),
        String(c.section || ""),
        Number(c.day),
        c.start_time,
        c.end_time,
        String(c.room || ""),
        Number(c.units || 0),
      ),
    );
    if (b.replace === true)
      stmts.unshift(
        env.DB.prepare("DELETE FROM classes WHERE schedule_id=?").bind(s.id),
      );
    if (b.replace_tasks === true)
      stmts.unshift(
        env.DB.prepare("DELETE FROM planner_tasks WHERE schedule_id=?").bind(
          s.id,
        ),
      );
    for (const t of b.tasks || [])
      stmts.push(
        env.DB.prepare(
          "INSERT INTO planner_tasks(id,schedule_id,title,notes,task_date,start_time,end_time,category,priority,completed) VALUES(?,?,?,?,?,?,?,?,?,?)",
        ).bind(
          crypto.randomUUID(),
          s.id,
          String(t.title).trim(),
          String(t.notes || "").slice(0, 1000),
          t.task_date,
          t.start_time || null,
          t.end_time || null,
          t.category || "Personal",
          t.priority || "normal",
          t.completed ? 1 : 0,
        ),
      );
    if (stmts.length) await env.DB.batch(stmts);
    if (typeof b.semester === "string" || typeof b.academic_year === "string")
      await env.DB.prepare(
        "UPDATE schedules SET semester=?,academic_year=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND device_id=?",
      )
        .bind(
          String(b.semester || "").slice(0, 80),
          String(b.academic_year || "").slice(0, 40),
          s.id,
          id,
        )
        .run();
    return json(await schedule(env, id), 201);
  }
  if (m === "POST" && p === "/api/tasks") {
    let t;
    try {
      t = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const e = validateTask(t);
    if (e) return json({ error: e }, 400);
    await env.DB.prepare(
      "INSERT INTO planner_tasks(id,schedule_id,title,notes,task_date,start_time,end_time,category,priority,completed) VALUES(?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        crypto.randomUUID(),
        s.id,
        String(t.title).trim(),
        String(t.notes || "").slice(0, 1000),
        t.task_date,
        t.start_time || null,
        t.end_time || null,
        t.category || "Personal",
        t.priority || "normal",
        t.completed ? 1 : 0,
      )
      .run();
    return json(await schedule(env, id), 201);
  }
  if (m === "PUT" && p.startsWith("/api/tasks/")) {
    let t;
    try {
      t = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const e = validateTask(t);
    if (e) return json({ error: e }, 400);
    const tid = p.slice(11);
    await env.DB.prepare(
      "UPDATE planner_tasks SET title=?,notes=?,task_date=?,start_time=?,end_time=?,category=?,priority=?,completed=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND schedule_id=?",
    )
      .bind(
        String(t.title).trim(),
        String(t.notes || "").slice(0, 1000),
        t.task_date,
        t.start_time || null,
        t.end_time || null,
        t.category || "Personal",
        t.priority || "normal",
        t.completed ? 1 : 0,
        tid,
        s.id,
      )
      .run();
    return json(await schedule(env, id));
  }
  if (m === "PATCH" && p.startsWith("/api/tasks/") && p.endsWith("/complete")) {
    let b;
    try {
      b = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (typeof b.completed !== "boolean")
      return json({ error: "completed must be boolean" }, 400);
    const tid = p.slice(11, -9);
    await env.DB.prepare(
      "UPDATE planner_tasks SET completed=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND schedule_id=?",
    )
      .bind(b.completed ? 1 : 0, tid, s.id)
      .run();
    return json(await schedule(env, id));
  }
  if (m === "DELETE" && p.startsWith("/api/tasks/")) {
    const tid = p.slice(11);
    await env.DB.prepare(
      "DELETE FROM planner_tasks WHERE id=? AND schedule_id=?",
    )
      .bind(tid, s.id)
      .run();
    return json(await schedule(env, id));
  }
  return json({ error: "Not found" }, 404);
}
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    try {
      const backupPath = u.pathname.toLowerCase().startsWith("/backup");
      const maintenance = env.MAINTENANCE_MODE === "true";
      const apiPath = u.pathname.startsWith("/api/");
      const faviconPath = u.pathname === "/favicon.ico";
      const guideVariantPath =
        /^\/import-guide_(light|dark)\.gif$/i.test(u.pathname) &&
        (req.method === "GET" || req.method === "HEAD");
      const fallbackPath = ["/fallback", "/fallback.html"].includes(
        u.pathname,
      );
      const response = backupPath
        ? new Response("Not found", {
            status: 404,
            headers: { "cache-control": "no-store" },
          })
        : faviconPath && (req.method === "GET" || req.method === "HEAD")
          ? new Response(null, {
              status: 302,
              headers: {
                location: new URL("/assets/icon.svg", req.url).toString(),
                "cache-control": "public, max-age=86400",
              },
            })
        : guideVariantPath
          ? await guideAsset(req, env)
        : !maintenance &&
            fallbackPath &&
            (req.method === "GET" || req.method === "HEAD")
          ? new Response(null, {
              status: 302,
              headers: {
                location: new URL("/", req.url).toString(),
                "cache-control": "no-store",
              },
            })
        : apiPath
          ? await api(req, env)
          : maintenance &&
              !["/fallback", "/fallback.html", "/fallback.js"].includes(
                u.pathname,
              )
            ? await env.ASSETS.fetch(
                new Request(new URL("/fallback.html", req.url), req),
              )
            : await env.ASSETS.fetch(req);
      return await secureResponse(response);
    } catch (e) {
      console.error(e);
      return secureResponse(json({ error: "Internal server error" }, 500));
    }
  },
};
