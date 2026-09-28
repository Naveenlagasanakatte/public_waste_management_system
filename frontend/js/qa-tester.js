/**
 * Smart Waste Management System (SWMS-2026-P1)
 * QA Validation Suite & CSV Audit Log Controller
 */

document.addEventListener("DOMContentLoaded", () => {
  const btnRunQA = document.getElementById("btnRunAllQATests");
  const qaTableBody = document.getElementById("qaResultsTableBody");
  const btnRefreshCSV = document.getElementById("btnRefreshCSV");
  const csvTableBody = document.getElementById("csvTableBody");

  // Run QA Validation Tests
  if (btnRunQA) {
    btnRunQA.addEventListener("click", async () => {
      btnRunQA.disabled = true;
      btnRunQA.innerHTML = `<span>⏳</span> Running 10 Acceptance Tests...`;
      qaTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--color-dry); padding: 2rem;">
            Executing sensor physics tests, state machine de-duplication, reset validation, and schema checks...
          </td>
        </tr>
      `;

      try {
        const resp = await fetch("/api/qa/run-tests", { method: "POST" });
        const data = await resp.json();

        qaTableBody.innerHTML = "";
        data.results.forEach(test => {
          const row = document.createElement("tr");
          row.innerHTML = `
            <td style="font-weight: 700; color: var(--text-muted);">${test.id}</td>
            <td style="font-weight: 600; color: var(--text-primary);">${test.name}</td>
            <td style="color: var(--text-secondary); font-size: 0.82rem;">${test.description}</td>
            <td style="font-family: var(--font-mono); font-size: 0.78rem; color: #93c5fd;">${test.criteria}</td>
            <td style="font-family: var(--font-mono); font-size: 0.8rem; color: ${test.passed ? '#34d399' : '#f87171'};">${test.measured}</td>
            <td>
              <span class="status-tag ${test.passed ? 'pass' : 'fail'}">
                ${test.passed ? '✓ PASSED' : '✗ FAILED'}
              </span>
            </td>
          `;
          qaTableBody.appendChild(row);
        });

        console.log(`[QA] Executed 10 QA tests. Pass rate: ${data.pass_rate} (${data.passed_tests}/10)`);
      } catch (err) {
        qaTableBody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; color: #ef4444; padding: 2rem;">
              Failed to execute QA tests: ${err.message}
            </td>
          </tr>
        `;
      } finally {
        btnRunQA.disabled = false;
        btnRunQA.innerHTML = `<span>▶️</span> Run All 10 Validation Tests`;
      }
    });
  }

  // Load and Render CSV Logs
  window.loadCSVLogs = async function() {
    if (!csvTableBody) return;
    try {
      const resp = await fetch("/api/logs/csv");
      const text = await resp.text();
      const lines = text.trim().split("\n");

      csvTableBody.innerHTML = "";
      if (lines.length <= 1) {
        csvTableBody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">
              No audit logs recorded yet.
            </td>
          </tr>
        `;
        return;
      }

      // Skip header line
      for (let i = lines.length - 1; i >= 1; i--) {
        const parts = lines[i].split(",");
        if (parts.length >= 5) {
          const row = document.createElement("tr");
          row.innerHTML = `
            <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-secondary);">${parts[0]}</td>
            <td style="font-weight: 700;">${parts[1]}</td>
            <td style="text-transform: uppercase; color: ${parts[2] === 'organic' ? 'var(--color-organic)' : 'var(--color-dry)'};">${parts[2]}</td>
            <td style="font-family: var(--font-mono); font-weight: 700; color: ${parseInt(parts[3]) >= 80 ? '#ef4444' : 'var(--text-primary)'};">${parts[3]}%</td>
            <td>
              <span class="status-tag ${parts[4].includes('DISPATCHED') ? 'fail' : 'pass'}" style="font-size: 0.7rem;">
                ${parts[4]}
              </span>
            </td>
          `;
          csvTableBody.appendChild(row);
        }
      }
    } catch (e) {
      console.error("Failed to load CSV:", e);
    }
  };

  if (btnRefreshCSV) {
    btnRefreshCSV.addEventListener("click", () => {
      window.loadCSVLogs();
      console.log("[AUDIT] Refreshed CSV audit logs.");
    });
  }
});
