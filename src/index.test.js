import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.js";

const deviceCookie = `__Host-clsu_device=${"a".repeat(64)}`;

async function request(env, path, method, body) {
  return worker.fetch(
    new Request(`https://planner.test${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        cookie: deviceCookie,
      },
      body,
    }),
    env,
  );
}

function createEnvironment() {
  const updates = [];
  const batches = [];
  const schedule = {
    id: "schedule-1",
    title: "My CLSU Life Planner",
    semester: "",
    academic_year: "",
  };

  return {
    updates,
    batches,
    env: {
      MAINTENANCE_MODE: "false",
      DB: {
        async batch(statements) {
          batches.push(
            statements.map(({ query, values }) => ({ query, values })),
          );
          return [];
        },
        prepare(query) {
          return {
            bind(...values) {
              return {
                query,
                values,
                async first() {
                  if (query.startsWith("SELECT id FROM anonymous_devices"))
                    return { id: "device-1" };
                  if (query.startsWith("SELECT id,title,semester,academic_year FROM schedules"))
                    return schedule;
                  throw new Error(`Unexpected first query: ${query}`);
                },
                async all() {
                  if (
                    query.startsWith("SELECT id,subject_code") ||
                    query.startsWith("SELECT id,title,notes")
                  )
                    return { results: [] };
                  throw new Error(`Unexpected all query: ${query}`);
                },
                async run() {
                  updates.push({ query, values });
                  return { meta: { changes: 1 } };
                },
              };
            },
          };
        },
      },
    },
  };
}

const malformedBodies = [
  {
    path: "/api/schedule",
    method: "PUT",
    body: "null",
    error: "Expected schedule object",
  },
  {
    path: "/api/schedule",
    method: "PUT",
    body: "[]",
    error: "Expected schedule object",
  },
  {
    path: "/api/import",
    method: "POST",
    body: "null",
    error: "Expected import object",
  },
  {
    path: "/api/import",
    method: "POST",
    body: "[]",
    error: "Expected import object",
  },
  {
    path: "/api/tasks/task-1/complete",
    method: "PATCH",
    body: "null",
    error: "Expected completion object",
  },
  {
    path: "/api/tasks/task-1/complete",
    method: "PATCH",
    body: "[]",
    error: "Expected completion object",
  },
];

for (const { path, method, body, error } of malformedBodies) {
  test(`rejects ${method} ${path} body ${body}`, async () => {
    const { env, updates } = createEnvironment();
    const response = await request(env, path, method, body);

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error });
    assert.equal(updates.length, 0);
  });
}

test("accepts a schedule update object", async () => {
  const { env, updates } = createEnvironment();
  const response = await request(
    env,
    "/api/schedule",
    "PUT",
    JSON.stringify({
      title: "Semester plan",
      semester: "1st Semester",
      academic_year: "2026-2027",
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].values.slice(0, 4), [
    "Semester plan",
    "1st Semester",
    "2026-2027",
    "schedule-1",
  ]);
  assert.match(updates[0].values[4], /^[a-f0-9]{64}$/);
});

test("replaces imported classes and tasks and restores schedule metadata", async () => {
  const { env, batches } = createEnvironment();
  const response = await request(
    env,
    "/api/import",
    "POST",
    JSON.stringify({
      classes: [
        {
          subject_code: "BIO 101",
          subject_name: "Biology",
          day: 0,
          start_time: "08:00",
          end_time: "09:00",
          units: 3,
        },
      ],
      tasks: [],
      replace: true,
      replace_tasks: true,
      title: "Semester plan",
      semester: "1st Semester",
      academic_year: "2026-2027",
    }),
  );

  assert.equal(response.status, 201);
  assert.deepEqual(
    batches[0].map(({ query }) => query),
    [
      "DELETE FROM planner_tasks WHERE schedule_id=?",
      "DELETE FROM classes WHERE schedule_id=?",
      "INSERT INTO classes(id,schedule_id,subject_code,subject_name,section,day,start_time,end_time,room,units,instructor) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      "UPDATE schedules SET title=?,semester=?,academic_year=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND device_id=?",
    ],
  );
  assert.deepEqual(batches[0][3].values.slice(0, 4), [
    "Semester plan",
    "1st Semester",
    "2026-2027",
    "schedule-1",
  ]);
});
