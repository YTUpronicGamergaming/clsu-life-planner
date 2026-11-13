function normalizeHeader(value) {
  const label = value.toLowerCase().replace(/[^a-z]/g, "");
  if (label === "subject" || label === "subjectcode") return "subject";
  if (label === "section") return "section";
  if (label === "unit" || label === "units") return "units";
  if (label === "day" || label === "days") return "days";
  if (label === "time") return "time";
  if (label === "room") return "room";
  if (
    [
      "faculty",
      "facultyname",
      "instructor",
      "instructorname",
      "instructors",
      "prof",
      "professor",
      "professorname",
      "teacher",
      "teachername",
    ].includes(label)
  )
    return "instructor";
  return "";
}

function findHeader(lines) {
  for (const line of lines) {
    const columns = line.items
      .map((item) => ({ field: normalizeHeader(item.s), x: item.x }))
      .filter((column) => column.field)
      .sort((a, b) => a.x - b.x);
    const fields = new Set(columns.map((column) => column.field));
    if (
      fields.has("subject") &&
      fields.has("units") &&
      fields.has("days") &&
      fields.has("time") &&
      fields.has("room")
    )
      return { line, columns };
  }
  return null;
}

function columnIndexAt(columns, x) {
  if (x < columns[0].x - 3) return -1;
  for (let i = 1; i < columns.length; i++) {
    if (x < (columns[i - 1].x + columns[i].x) / 2) return i - 1;
  }
  return columns.length - 1;
}

function mapLine(line, columns) {
  const cells = Object.fromEntries(columns.map(({ field }) => [field, []]));
  for (const item of line.items) {
    const index = columnIndexAt(columns, item.x);
    if (index >= 0) cells[columns[index].field].push(item);
  }
  return Object.fromEntries(
    Object.entries(cells).map(([field, items]) => [
      field,
      items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.s)
        .join(" ")
        .trim(),
    ]),
  );
}

function parseDay(value) {
  const day = value.replace(/_/g, "").trim().toLowerCase();
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
    sa: 5,
    sat: 5,
  }[day];
}

function clock24(value) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw Error(`Unrecognized time: ${value}`);
  let hour = Number(match[1]);
  const minute = match[2];
  if (hour !== 12 && hour >= 1 && hour <= 6) hour += 12;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function roomTextForLine(line, lines, columns) {
  const roomIndex = columns.findIndex((column) => column.field === "room");
  const roomStart =
    roomIndex === 0
      ? -Infinity
      : (columns[roomIndex - 1].x + columns[roomIndex].x) / 2;
  const roomEnd =
    roomIndex === columns.length - 1
      ? Infinity
      : (columns[roomIndex].x + columns[roomIndex + 1].x) / 2;
  return lines
    .filter((candidate) => Math.abs(candidate.y - line.y) <= 8)
    .flatMap((candidate) =>
      candidate.items
        .filter((item) => item.x >= roomStart && item.x < roomEnd)
        .map((item) => ({ y: candidate.y, x: item.x, s: item.s })),
    )
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((item) => item.s)
    .join(" ")
    .trim();
}

function subjectNameForLine(line, lines, columns) {
  return (
    lines
      .filter((candidate) => candidate.y < line.y && line.y - candidate.y < 20)
      .map((candidate) => mapLine(candidate, columns))
      .find(
        (cells) =>
          cells.subject &&
          columns.every(
            ({ field }) => field === "subject" || !cells[field],
          ),
      )?.subject || ""
  );
}

function parsePage(lines, sectionFallback) {
  const header = findHeader(lines);
  if (!header) return [];

  const { columns } = header;
  const records = [];
  for (const line of lines) {
    if (line.y >= header.line.y) continue;
    const cells = mapLine(line, columns);
    const subject = cells.subject;
    if (
      !subject ||
      !cells.days ||
      !cells.time ||
      !/^\[?\d+(?:\.\d+)?\]?$/.test(cells.units || "")
    )
      continue;

    const dayParts = cells.days.split("/").map((part) => part.trim());
    const timeParts = cells.time.split("/").map((part) => part.trim());
    const roomParts = roomTextForLine(line, lines, columns)
      .split("/")
      .map((part) => part.trim());
    if (dayParts.length !== timeParts.length)
      throw Error(
        `The day/time count does not match for ${subject}. Please check this PDF manually.`,
      );

    dayParts.forEach((value, index) => {
      const day = parseDay(value);
      if (day === undefined)
        throw Error(`Unrecognized weekday "${value}" for ${subject}.`);
      const time = timeParts[index].match(
        /^(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})$/,
      );
      if (!time)
        throw Error(
          `Unrecognized time range "${timeParts[index]}" for ${subject}.`,
        );

      const start_time = clock24(time[1]);
      const end_time = clock24(time[2]);
      if (start_time >= end_time)
        throw Error(`Invalid time range for ${subject}: ${timeParts[index]}.`);

      records.push({
        subject_code: subject,
        subject_name: subjectNameForLine(line, lines, columns) || subject,
        section: (cells.section || sectionFallback).replace(/_/g, " ").trim(),
        units: Number(cells.units.replace(/[\[\]]/g, "")),
        day,
        start_time,
        end_time,
        room: (roomParts[index] || roomParts[0] || "")
          .replace(/_+$/g, "")
          .trim(),
        instructor: cells.instructor || "",
      });
    });
  }
  return records;
}

export function parsePdfSchedule(pages, sectionFallback = "") {
  return pages.flatMap((lines) => parsePage(lines, sectionFallback));
}
