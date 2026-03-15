import { useState, useMemo } from "react";
import * as XLSX from "xlsx";

function parseTimetable(workbook) {
  const courses = [];
  workbook.SheetNames.forEach((sheetName) => { // multiple sheets 
    const ws   = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }); // convert to 2d array

    // Locate the header row (first row whose col-0 is exactly "Code")
    const headerRowIdx = rows.findIndex((r) => r && String(r[0] ?? "").trim() === "Code");
    if (headerRowIdx === -1) return;

    // Build col-name → col-index map
    const col = {};
    rows[headerRowIdx].forEach((cell, ci) => {
      if (cell != null) col[String(cell).trim()] = ci;
    });

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const code = r[col["Code"]];
      // Skip blank rows and sub-batch label rows (they lack a valid course code)
      if (!code || typeof code !== "string" || !/^[A-Z]{2,4}\d{3,4}/.test(code.trim())) continue;

      courses.push({
        department: sheetName,
        code:       code.trim(),
        title:      String(r[col["Course Title"]]    ?? "").trim(),
        section:    String(r[col["Section"]]         ?? "").trim(),
        instructor: String(r[col["Instructor Name"]] ?? "").trim(),
        day1:       String(r[col["Day 1"]]           ?? "").trim(),
        slot1:      String(r[col["Slot 1"]]          ?? "").trim(),
        venue1:     String(r[col["Venue 1"]]         ?? "").trim(),
        day2:       String(r[col["Day 2"]]           ?? "").trim(),
        slot2:      String(r[col["Slot 2"]]          ?? "").trim(),
        venue2:     String(r[col["Venue 2"]]         ?? "").trim(),
      });
    }
  });
  return courses;
}

function parseClashReport(workbook) {
  const ws   = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const out  = [];

  for (let i = 1; i < rows.length; i++) {          // row 0 = headers
    const r = rows[i];
    if (!r || r.length < 4) continue;
    const fullName  = String(r[1] ?? "").trim();
    const section   = String(r[2] ?? "").trim();
    const count     = parseInt(r[3], 10);
    if (!fullName || !section || isNaN(count)) continue;

    const m = fullName.match(/^([A-Z]{2,4}\d{3,4})\s*-\s*(.+)/);
    out.push({
      code:       m ? m[1] : fullName.split(/\s/)[0],
      courseName: m ? m[2].trim() : fullName,
      section,
      clashCount: count,
    });
  }
  return out;
}

/* MAIN   */
export default function App() {
  const [courses,    setCourses]    = useState([]);
  const [clashRows,  setClashRows]  = useState([]);
  const [tab,        setTab]        = useState("tt");
  const [clashOnly,  setClashOnly]  = useState(false);

  const loadTimetable = async (file) => {
    const wb = XLSX.read(await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = (e) => res(new Uint8Array(e.target.result));
      r.onerror = rej;
      r.readAsArrayBuffer(file);
    }), { type: "array" });
    setCourses(parseTimetable(wb));
  };

  const loadClash = async (file) => {
    const wb = XLSX.read(await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = (e) => res(new Uint8Array(e.target.result));
      r.onerror = rej;
      r.readAsArrayBuffer(file);
    }), { type: "array" });
    setClashRows(parseClashReport(wb));
  };

  // clashMap[code][section] = total clashing students
  const clashMap = useMemo(() => {
    const m = {};
    clashRows.forEach(({ code, section, clashCount }) => {
      if (!m[code]) m[code] = {};
      m[code][section] = (m[code][section] || 0) + clashCount;
    });
    return m;
  }, [clashRows]);

  // slotClashMap["Mon 08:30"] = total clashing students in that slot
  const slotClashMap = useMemo(() => {
    const m = {};
    courses.forEach((c) => {
      const n = clashMap[c.code]?.[c.section] || 0;
      if (!n) return;
      [(c.day1 && c.slot1 ? `${c.day1} ${c.slot1}` : null), (c.day2 && c.slot2 ? `${c.day2} ${c.slot2}` : null)].forEach((k) => { if (k) m[k] = (m[k] || 0) + n; });
    });
    return m;
  }, [courses, clashMap]);

  const filtered = useMemo(() => courses.filter((c) => {
    if (clashOnly && !(clashMap[c.code]?.[c.section] > 0))      return false;
    return true;
  }), [courses, clashOnly, clashMap]);

 return (
  <div style={{ padding: 40, fontFamily: "Arial" }}>
    
    <h1>Timetable Clash Analyzer</h1>

    {/* Upload Section */}
    <div style={{ marginBottom: 20 }}>
      <div>
        <p><b>Upload Timetable</b></p>
        <input type="file" accept=".xlsx" onChange={(e)=> e.target.files[0] && loadTimetable(e.target.files[0])}/>
      </div>

      <div style={{ marginTop: 10 }}>
        <p><b>Upload Clash Report</b></p>
        <input type="file" accept=".xlsx" onChange={(e)=> e.target.files[0] && loadClash(e.target.files[0])}/>
      </div>
    </div>

    {/* Tabs */}
    <div style={{ marginBottom: 20 }}>
      <button onClick={()=>setTab("tt")}>Timetable</button>
      <button onClick={()=>setTab("cr")}>Clash Report</button>
      <button onClick={()=>setTab("slots")}>Slot Summary</button>
    </div>

    {/* TIMETABLE TAB */}
    {tab === "tt" && (
      <div>
        {clashRows.length > 0 && (
          <label>
            <input type="checkbox"
              checked={clashOnly}
              onChange={(e)=>setClashOnly(e.target.checked)}
            />
            Clashing Only
          </label>
        )}

        <p>{filtered.length} rows</p>

        <table border="1" cellPadding="6">
          <thead>
            <tr>
              <th>Code</th>
              <th>Course</th>
              <th>Section</th>
              <th>Instructor</th>
              <th>Day 1</th>
              <th>Slot 1</th>
              <th>Venue 1</th>
              <th>Day 2</th>
              <th>Slot 2</th>
              <th>Venue 2</th>
              <th>Dept</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((c,i)=>{
              const n = clashMap[c.code]?.[c.section] || 0

              return (
                <tr key={i}>
                  <td>{c.code}</td>
                  <td>{c.title}</td>
                  <td>{c.section}</td>
                  <td>{c.instructor}</td>
                  <td>{c.day1}</td>
                  <td>{c.slot1}</td>
                  <td>{c.venue1}</td>
                  <td>{c.day2}</td>
                  <td>{c.slot2}</td>
                  <td>{c.venue2}</td>
                  <td>{c.department}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )}

    {/* CLASH TAB */}
    {tab === "cr" && (
      <div>

        <h3>Clashing Courses</h3>

        <table border="1" cellPadding="6">
          <thead>
            <tr>
              <th>#</th>
              <th>Code</th>
              <th>Course</th>
              <th>Section</th>
              <th>Clashes</th>
            </tr>
          </thead>

          <tbody>
            {clashRows.map((cl,i)=>(
              <tr key={i}>
                <td>{i+1}</td>
                <td>{cl.code}</td>
                <td>{cl.courseName}</td>
                <td>{cl.section}</td>
                <td>{cl.clashCount}</td>
              </tr>
            ))}
          </tbody>
        </table>

      </div>
    )}

    {/* SLOT SUMMARY */}
    {tab === "slots" && (
      <div>

        <h3>Slot Clash Summary</h3>

        <table border="1" cellPadding="6">
          <thead>
            <tr>
              <th>Slot</th>
              <th>Clashing Students</th>
            </tr>
          </thead>

          <tbody>
            {Object.entries(slotClashMap)
              .sort((a,b)=>b[1]-a[1])
              .map(([slot,count])=>(
                <tr key={slot}>
                  <td>{slot}</td>
                  <td>{count}</td>
                </tr>
              ))
            }
          </tbody>
        </table>

      </div>
    )}

  </div>
)
}