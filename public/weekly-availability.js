(function () {
  const reports = [
    { programme: "EMMS", label: "1 May 2026", availability: 0.457, available: 218, total: 477 },
    { programme: "EMMS", label: "8 May 2026", availability: 0.4612, available: 220, total: 477 },
    { programme: "EMMS", label: "15 May 2026", availability: 0.4465, available: 213, total: 477 },
    { programme: "LAB", label: "8 May 2026", availability: 0.5121, available: null, total: null },
    { programme: "LAB", label: "15 May 2026", availability: 0.4979, available: null, total: null },
  ];

  const categories = {
    EMMS: [
      ["Vaccines", 0],
      ["Gloves", 0],
      ["Cotton wool, dressing, swabs & bandages", 0.1111],
      ["Dermatological/topical medicines", 0.1429],
      ["Antiinfective medicines", 0.1429],
      ["Antidotes and poisoning treatment", 0.2],
      ["Antineoplastics and immunomodulators", 0.25],
      ["Imaging", 0.25],
      ["Antiallergics", 0.25],
      ["Epidemic supplies", 0.2593],
      ["Sutures", 0.3],
    ],
    LAB: [
      ["Pipettes & Tips", 0],
      ["Biochemistry", 0.21],
      ["Acids & Alcochols", 0.25],
      ["Microbiology & Parasitology", 0.27],
      ["Haematology & Blood Transfusion", 0.32],
      ["Histopthology & Cytology", 0.36],
      ["General Labs", 0.4],
      ["Specimen Containers", 0.5],
      ["RDTs", 0.57],
      ["Microscope Slides & Coverslips", 0.67],
    ],
  };

  const changes = {
    newlyUnavailable: [
      ["Linezolid", "Anti-TB medicines"],
      ["Delamanid 50mg Tablet(672)", "Anti-TB medicines"],
      ["Artemether + Lumefantrine 20/120 mg (12) Tab(30)", "Antimalarial"],
      ["Metronidazole tabs", "Antiinfective medicines"],
      ["Methylprednisolone", "Antiallergics"],
      ["Pethidine Inj", "Pain and palliative care"],
      ["Disposable Head cover", "Epidemic supplies"],
    ],
    recovered: [],
  };

  function pct(value) {
    return `${(value * 100).toFixed(1)}%`;
  }

  function addStyles() {
    if (document.getElementById("weekly-availability-style")) return;
    const style = document.createElement("style");
    style.id = "weekly-availability-style";
    style.textContent = `
      .weekly-section{margin-top:16px}.weekly-head{display:flex;justify-content:space-between;gap:16px;align-items:end;padding:18px 20px;border:1px solid rgba(19,43,31,.09);border-radius:8px;background:rgba(255,255,255,.92);box-shadow:0 10px 30px rgba(18,36,25,.06)}.weekly-head h2{margin-bottom:6px;font-size:22px}.weekly-head p{margin-bottom:0;color:#607168;line-height:1.55}.weekly-head select{min-width:150px;border:1px solid #ccd8d0;border-radius:8px;background:#fff;color:#22342a;padding:10px 11px}.weekly-grid,.change-grid{display:grid;gap:14px;margin-top:14px}.weekly-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.weekly-trend{min-height:210px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:end;margin-top:20px}.weekly-point{display:grid;gap:6px;justify-items:center;text-align:center}.weekly-point div{width:min(72px,80%);min-height:28px;border-radius:5px 5px 0 0;background:#1f7a4d}.weekly-point strong{color:#26372d;font-size:26px}.weekly-point span,.weekly-point small{color:#65776d;font-size:12px}.availability-bars{display:grid;gap:10px;margin-top:16px}.availability-row{display:grid;grid-template-columns:260px minmax(0,1fr) 52px;gap:12px;align-items:center;font-size:13px}.availability-row span{overflow:hidden;color:#34443a;text-overflow:ellipsis;white-space:nowrap}.availability-row b{color:#54655c;text-align:right}.availability-track{height:12px;overflow:hidden;border-radius:999px;background:#e8eee9}.availability-track div{height:100%;border-radius:inherit}.availability-track .red{background:#d04437}.availability-track .amber{background:#d7891d}.availability-track .green{background:#1f7a4d}.change-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.change-card{min-height:160px;padding:18px;border:1px solid rgba(19,43,31,.09);border-top:5px solid #d04437;border-radius:8px;background:rgba(255,255,255,.92);box-shadow:0 10px 30px rgba(18,36,25,.06)}.change-card.recovered{border-top-color:#1f7a4d}.change-card span{color:#607168;font-size:13px;font-weight:760}.change-card strong{display:block;margin:6px 0 10px;color:#26372d;font-size:36px}.change-card p{margin-bottom:0;color:#607168;line-height:1.55}.change-card ul{display:grid;gap:8px;margin:0;padding-left:18px;color:#26372d}.change-card small{display:block;color:#607168}@media(max-width:980px){.weekly-grid,.change-grid{grid-template-columns:1fr}.weekly-head{align-items:stretch;flex-direction:column}.availability-row{grid-template-columns:130px minmax(0,1fr) 44px}}
    `;
    document.head.appendChild(style);
  }

  function availabilityRows(programme) {
    return categories[programme].map(([name, availability]) => {
      const tone = availability < 0.25 ? "red" : availability < 0.5 ? "amber" : "green";
      return `<div class="availability-row"><span>${name}</span><div class="availability-track"><div class="${tone}" style="width:${availability * 100}%"></div></div><b>${pct(availability)}</b></div>`;
    }).join("");
  }

  function trendPoints(programme) {
    return reports.filter((report) => report.programme === programme).map((report) => (
      `<div class="weekly-point"><div style="height:${40 + report.availability * 100}px"></div><strong>${pct(report.availability)}</strong><span>${report.label}</span><small>${report.total ? `${report.available}/${report.total} available` : "Category average"}</small></div>`
    )).join("");
  }

  function render(programme) {
    const latest = reports.filter((report) => report.programme === programme).at(-1);
    return `
      <div class="weekly-head">
        <div>
          <p class="eyebrow dark">Weekly Inventory Availability</p>
          <h2>Submitted weekly EMMS and LAB reports</h2>
          <p>Availability is based on the submitted Excel files for 1 May, 8 May, and 15 May. Dashboard enhancement published 20 May 2026.</p>
        </div>
        <select id="weekly-programme-select" aria-label="Weekly programme">
          <option value="EMMS"${programme === "EMMS" ? " selected" : ""}>EMMS</option>
          <option value="LAB"${programme === "LAB" ? " selected" : ""}>LAB</option>
        </select>
      </div>
      <div class="weekly-grid">
        <div class="panel">
          <h2>${programme} availability trend</h2>
          <div class="weekly-trend">${trendPoints(programme)}</div>
        </div>
        <div class="panel span-2">
          <h2>Lowest category availability - ${latest.label}</h2>
          <div class="availability-bars">${availabilityRows(programme)}</div>
        </div>
      </div>
      <div class="change-grid">
        <div class="change-card">
          <span>Newly unavailable</span>
          <strong>${changes.newlyUnavailable.length}</strong>
          <ul>${changes.newlyUnavailable.map(([item, category]) => `<li>${item}<small>${category}</small></li>`).join("")}</ul>
        </div>
        <div class="change-card recovered">
          <span>Recovered</span>
          <strong>${changes.recovered.length}</strong>
          ${changes.recovered.length ? `<ul>${changes.recovered.map(([item, category]) => `<li>${item}<small>${category}</small></li>`).join("")}</ul>` : "<p>No matched EMMS items recovered between 8 May and 15 May.</p>"}
        </div>
      </div>
    `;
  }

  function injectSection() {
    if (document.body.textContent.includes("Weekly Inventory Availability")) return;
    const anchor = document.querySelector(".trend-panel");
    if (!anchor) return;
    addStyles();
    const section = document.createElement("section");
    section.className = "weekly-section";
    const bindSelect = () => section.querySelector("#weekly-programme-select").addEventListener("change", (event) => {
      section.innerHTML = render(event.target.value);
      bindSelect();
    });
    section.innerHTML = render("EMMS");
    anchor.insertAdjacentElement("afterend", section);
    bindSelect();
  }

  function weeklyAnswer(question) {
    const lower = question.toLowerCase();
    if (lower.includes("lab")) {
      return "The 15 May LAB report shows overall category-average availability of 49.8%, down from 51.2% on 8 May. Lowest LAB categories are Pipettes & Tips 0.0%, Biochemistry 21.0%, Acids & Alcochols 25.0%, Microbiology & Parasitology 27.0%, and Haematology & Blood Transfusion 32.0%.";
    }
    if (lower.includes("15 may") || lower.includes("latest week")) {
      return "From 8 May to 15 May, EMMS availability moved from 46.1% to 44.7%. Seven EMMS items became newly unavailable: Linezolid, Delamanid 50mg Tablet(672), Artemether + Lumefantrine 20/120 mg (12) Tab(30), Metronidazole tabs, Methylprednisolone, Pethidine Inj, and Disposable Head cover. LAB moved from 51.2% to 49.8%.";
    }
    if (lower.includes("what changed") || lower.includes("1 may") || lower.includes("8 may") || lower.includes("weekly")) {
      return "From 1 May to 8 May, EMMS availability moved from 45.7% to 46.1%. No matched EMMS items became newly unavailable, and 2 items recovered: Ferrous Sulphate and Multivitamin.";
    }
    return "";
  }

  function attachCopilot() {
    const form = document.querySelector(".assistant-chat form");
    const input = document.querySelector(".assistant-chat input");
    const answer = document.querySelector(".assistant-answer");
    const buttons = document.querySelector(".suggested-questions");
    if (!form || !input || !answer) return;
    if (buttons && !buttons.textContent.includes("What changed from 1 May to 8 May?")) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "What changed from 1 May to 8 May?";
      button.addEventListener("click", () => {
        input.value = button.textContent;
        answer.textContent = weeklyAnswer(button.textContent);
      });
      buttons.appendChild(button);
    }
    form.addEventListener("submit", (event) => {
      const response = weeklyAnswer(input.value || "");
      if (!response) return;
      event.preventDefault();
      answer.textContent = response;
    }, true);
  }

  function boot() {
    injectSection();
    attachCopilot();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 250));
  } else {
    setTimeout(boot, 250);
  }
})();
