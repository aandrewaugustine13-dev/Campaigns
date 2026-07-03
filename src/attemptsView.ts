// Entry for attempts.html — the dead-simple ATTEMPTS read view.
// Lists student_name / best_score / version (+ latest score and attempt count)
// for one campaign (?campaign=<uuid>) or the most recent rows across all.
import { listAttempts } from "./lib/attempts";

const campaignId = new URLSearchParams(location.search).get("campaign") ?? undefined;

const scope = document.getElementById("scope")!;
scope.textContent = campaignId
  ? `campaign ${campaignId}`
  : "most recent attempts across all campaigns — pass ?campaign=<uuid> to filter";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

async function main() {
  const rows = await listAttempts(campaignId);
  const out = document.getElementById("out")!;
  if (rows.length === 0) {
    out.innerHTML = `<p class="muted">No attempts yet${campaignId ? " for this campaign" : ""}. (If Supabase isn't configured, check the console.)</p>`;
    return;
  }
  out.innerHTML = `
    <table>
      <thead><tr>
        <th>Student</th><th>Best</th><th>Version</th><th>Latest score</th><th>Attempts</th><th>Campaign</th><th>When</th>
      </tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${esc(r.student_name || "(anonymous)")}</td>
            <td class="num">${r.best_score}%</td>
            <td class="num">v${r.campaign_version}</td>
            <td class="num">${r.score}%</td>
            <td class="num">${r.attempt_number}/2</td>
            <td><code>${esc(r.campaign_id.slice(0, 8))}…</code></td>
            <td>${esc(new Date(r.created_at).toLocaleString())}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

void main();
