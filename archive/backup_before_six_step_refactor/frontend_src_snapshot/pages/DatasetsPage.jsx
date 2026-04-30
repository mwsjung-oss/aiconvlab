import { useState } from "react";
import { apiJson } from "../api";

export default function DatasetsPage({ datasets, onRefresh, studentProjects = [] }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("v1");
  const [ownerName, setOwnerName] = useState("");
  const [studentProjectId, setStudentProjectId] = useState("");
  const [datasetType, setDatasetType] = useState("structured");
  const [targetVariable, setTargetVariable] = useState("");
  const [timeIndex, setTimeIndex] = useState("");
  const [sensorColumns, setSensorColumns] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState(null);

  async function createDataset(e) {
    e.preventDefault();
    setErr(null);
    try {
      await apiJson("/api/portal/datasets", {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          version,
          owner_name: ownerName || null,
          student_project_id: studentProjectId ? Number(studentProjectId) : null,
          dataset_type: datasetType || null,
          target_variable: targetVariable || null,
          time_index: timeIndex || null,
          sensor_columns: sensorColumns
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          notes: notes || null,
          schema_data: {},
          tags: [],
        }),
      });
      setName("");
      setDescription("");
      setOwnerName("");
      setStudentProjectId("");
      setTargetVariable("");
      setTimeIndex("");
      setSensorColumns("");
      setNotes("");
      await onRefresh?.();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <div className="grid">
      <section className="panel">
        <h2>Dataset Catalog</h2>
        <form className="auth-form" onSubmit={createDataset}>
          <label>
            이름
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            설명
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label>
            버전
            <input value={version} onChange={(e) => setVersion(e.target.value)} />
          </label>
          <label>
            Owner/Student
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
          </label>
          <label>
            Student Project
            <select value={studentProjectId} onChange={(e) => setStudentProjectId(e.target.value)}>
              <option value="">미지정</option>
              {studentProjects.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.student_name} - {sp.title_kr}
                </option>
              ))}
            </select>
          </label>
          <label>
            Dataset Type
            <select value={datasetType} onChange={(e) => setDatasetType(e.target.value)}>
              <option value="structured">structured</option>
              <option value="time-series">time-series</option>
              <option value="unstructured">unstructured</option>
            </select>
          </label>
          <label>
            Target Variable
            <input value={targetVariable} onChange={(e) => setTargetVariable(e.target.value)} />
          </label>
          <label>
            Time Index
            <input value={timeIndex} onChange={(e) => setTimeIndex(e.target.value)} />
          </label>
          <label>
            Sensor Columns (comma-separated)
            <input value={sensorColumns} onChange={(e) => setSensorColumns(e.target.value)} />
          </label>
          <label>
            Notes
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {err && <div className="auth-error">{err}</div>}
          <button className="auth-submit" type="submit">카탈로그 등록</button>
        </form>
      </section>
      <section className="panel">
        <h3>등록 데이터셋</h3>
        <button type="button" className="btn btn-secondary" onClick={onRefresh}>새로고침</button>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th>버전</th>
                <th>설명</th>
                <th>타입</th>
                <th>타깃</th>
                <th>Time Index</th>
              </tr>
            </thead>
            <tbody>
              {(datasets || []).map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.version}</td>
                  <td>{d.description || "-"}</td>
                  <td>{d.dataset_type || "-"}</td>
                  <td>{d.target_variable || "-"}</td>
                  <td>{d.time_index || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

