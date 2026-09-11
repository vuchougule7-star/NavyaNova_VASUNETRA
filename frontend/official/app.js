const fallbackVillages = [
  { village:"Sialsuk", slope:0.82, rainfall:0.75, population:152, access_score:0.40, land_change:0.146 },
  { village:"Zohmun", slope:0.55, rainfall:0.60, population:210, access_score:0.60, land_change:0.0 },
  { village:"Thenzawl", slope:0.48, rainfall:0.65, population:95,  access_score:0.50, land_change:0.0 },
  { village:"Reiek", slope:0.20, rainfall:0.30, population:180, access_score:0.80, land_change:0.0 },
  { village:"Aizawl_Rural1", slope:0.70, rainfall:0.55, population:300, access_score:0.30, land_change:0.0 },
  { village:"Aizawl_Rural2", slope:0.35, rainfall:0.40, population:120, access_score:0.70, land_change:0.0 },
  { village:"Lungdai",       slope:0.65, rainfall:0.70, population:88,  access_score:0.45, land_change:0.0 },
];

function scoreAll(rows){
  const maxPop = Math.max(...rows.map(r=>r.population));

  const scored = rows.map(r=>{
    const hazard_score =
      0.40*r.slope +
      0.35*r.rainfall +
      0.25*r.land_change;

    const population_norm = r.population / maxPop;
    const access_factor = 1 - r.access_score;

    const relocation_score =
      0.85*hazard_score +
      0.10*population_norm +
      0.05*access_factor;

    let recommended_action;

    if (hazard_score > 0.75)
      recommended_action = "Immediate Verification";
    else if (hazard_score > 0.55)
      recommended_action = "Relocation Assessment";
    else if (hazard_score > 0.35)
      recommended_action = "Enhanced Monitoring";
    else
      recommended_action = "Routine Monitoring";

    if (
      r.population > 250 &&
      recommended_action === "Routine Monitoring"
    ) {
      recommended_action = "Enhanced Monitoring";
    }

    return {
      ...r,
      hazard_score,
      population_norm,
      access_factor,
      relocation_score,
      recommended_action,
      hazard_pct:{
        hazard:0.85*hazard_score,
        pop:0.10*population_norm,
        access:0.05*access_factor
      }
    };
  });

  const idx = 0.75*(rows.length-1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);

  const popSortedAsc =
    [...rows.map(r=>r.population)].sort((a,b)=>a-b);

  const threshold =
    popSortedAsc[lo] +
    (popSortedAsc[hi]-popSortedAsc[lo])*(idx-lo);

  scored.forEach(r=>{
    r.high_population_flag = r.population > threshold;
  });

  scored.sort(
    (a,b)=>b.relocation_score-a.relocation_score
  );

  return scored;
}

let data = [];
let activeVillage = null;

async function loadData(){

  try {

    const response =
      await fetch('/api/villages', {
        cache:'no-store'
      });

    if(!response.ok)
      throw new Error('API unavailable');

    const rows = await response.json();

    data = rows.map(r=>({
      ...r,
      hazard_pct:{
        hazard:
          0.85*Number(r.hazard_score||0),

        pop:
          0.10*Number(r.population_norm||0),

        access:
          0.05*Number(r.access_factor||0)
      }
    }));

    activeVillage =
      data[0]?.village || null;

    document
      .querySelector('.mock-note')
      ?.remove();

  } catch(e) {

    data =
      scoreAll(fallbackVillages);

    activeVillage =
      data[0]?.village || null;
  }

  renderStats();
  renderVillageGrid();
  renderWorklist();
  renderDetail();
  setUpdatedTime();
  populateQAVillageDropdown();
}

function riskTier(hazard_score){

  if(hazard_score > 0.55)
    return "High";

  if(hazard_score > 0.35)
    return "Medium";

  return "Low";
}

function riskIcon(tier){

  return tier==="High"
    ? "!"
    : tier==="Medium"
      ? "•"
      : "✓";
}

function renderStats(){

  const highRisk =
    data.filter(
      d=>riskTier(d.hazard_score)==="High"
    ).length;

  const needsAction =
    data.filter(
      d=>[
        "Immediate Verification",
        "Relocation Assessment"
      ].includes(d.recommended_action)
    ).length;

  const highPop =
    data.filter(
      d=>d.high_population_flag
    ).length;

  const landChange =
    data.filter(
      d=>d.land_change > 0
    ).length;

  const cards = [

    {
      label:"High-risk villages",
      value:highRisk,
      icon:"⚠️",
      cls:"red"
    },

    {
      label:"Need verification / assessment",
      value:needsAction,
      icon:"🔍",
      cls:"amber"
    },

    {
      label:"High population pressure",
      value:highPop,
      icon:"👥",
      cls:"teal"
    },

    {
      label:"Land-change alerts",
      value:landChange,
      icon:"🏞️",
      cls:"red"
    },

  ];

  document.getElementById(
    "statsGrid"
  ).innerHTML = cards.map(c=>`

    <div class="stat-card">

      <div class="stat-icon ${c.cls}">
        ${c.icon}
      </div>

      <div>

        <div class="stat-label">
          ${c.label}
        </div>

        <div class="stat-value">
          ${c.value}
        </div>

      </div>

    </div>

  `).join("");
}

function renderVillageGrid(){

  document.getElementById(
    "villageGrid"
  ).innerHTML = data.map(d=>{

    const tier =
      riskTier(d.hazard_score);

    const active =
      d.village === activeVillage
        ? "active"
        : "";

    return `

      <div
        class="village-node ${active}"
        onclick="selectVillage('${d.village}')"
      >

        <div class="dot ${tier}">
          ${riskIcon(tier)}
        </div>

        <div class="vname">
          ${d.village.replace("_"," ")}
        </div>

      </div>

    `;

  }).join("");
}

function renderWorklist(){

  document.getElementById(
    "worklistBody"
  ).innerHTML = data.map(d=>{

    const tier =
      riskTier(d.hazard_score);

    const active =
      d.village === activeVillage
        ? "active"
        : "";

    return `

      <tr
        class="row ${active}"
        onclick="selectVillage('${d.village}')"
      >

        <td>
          ${d.village.replace("_"," ")}
        </td>

        <td>
          <span class="badge ${tier}">
            ${tier}
          </span>
        </td>

        <td>
          ${d.recommended_action}
        </td>

        <td class="pop-flag">
          ${d.high_population_flag ? "👥" : "—"}
        </td>

      </tr>

    `;

  }).join("");
}

function renderDetail(){

  const d =
    data.find(
      x=>x.village===activeVillage
    );

  if(!d) return;

  const tier =
    riskTier(d.hazard_score);

  document.getElementById(
    "detailPanel"
  ).innerHTML = `

    <div class="kicker">
      Village Detail
    </div>

    <div class="detail-header">

      <div class="detail-village">
        ${d.village.replace("_"," ")}
      </div>

      <span class="badge ${tier}">
        ${tier} risk
      </span>

    </div>

    <p
      style="color:var(--muted);font-size:12.5px;margin:0 0 6px;"
    >
      Why this score
    </p>

    <div class="why-bar">

      <div
        class="why-seg hazard"
        style="width:${(
          d.hazard_pct.hazard*100
        ).toFixed(1)}%"
      ></div>

      <div
        class="why-seg pop"
        style="width:${(
          d.hazard_pct.pop*100
        ).toFixed(1)}%"
      ></div>

      <div
        class="why-seg access"
        style="width:${(
          d.hazard_pct.access*100
        ).toFixed(1)}%"
      ></div>

    </div>

    <div class="why-legend">

      <span>
        <i style="background:var(--navy-soft)"></i>
        Hazard (slope, rainfall, land-change)
      </span>

      <span>
        <i style="background:#4C9BB5"></i>
        Population
      </span>

      <span>
        <i style="background:var(--amber)"></i>
        Access difficulty
      </span>

    </div>

    <div class="action-chip ${tier}">
      📌 ${d.recommended_action}
    </div>

    <div class="detail-row">
      <span class="k">
        Hazard score
      </span>
      <span class="v">
        ${d.hazard_score.toFixed(3)}
      </span>
    </div>

    <div class="detail-row">
      <span class="k">
        Relocation score
      </span>
      <span class="v">
        ${d.relocation_score.toFixed(3)}
      </span>
    </div>

    <div class="detail-row">
      <span class="k">
        Population
      </span>
      <span class="v">
        ${d.population}${
          d.high_population_flag
            ? " · high pressure 👥"
            : ""
        }
      </span>
    </div>

    <div class="detail-row">
      <span class="k">
        Access to safe zone
      </span>
      <span class="v">
        ${(d.access_score*100).toFixed(0)}% easy
      </span>
    </div>

    <div class="detail-row">
      <span class="k">
        Land change detected
      </span>
      <span class="v">
        ${
          d.land_change > 0
            ? (d.land_change*100).toFixed(1)+"%"
            : "None"
        }
      </span>
    </div>

    <div class="detail-row">
      <span class="k">
        Vulnerability index
      </span>
      <span class="v">
        ${
          (Number(
            d.vulnerability_index||0
          )*100).toFixed(0)
        }/100
      </span>
    </div>

    <div class="detail-row">
      <span class="k">
        Shelter capacity
      </span>
      <span class="v">
        ${
          Number(
            d.shelter_capacity||0
          ).toFixed(0)
        } people
      </span>
    </div>

    <div class="detail-row">
      <span class="k">
        Capacity pressure
      </span>
      <span class="v">
        ${
          (Number(
            d.capacity_pressure||0
          )*100).toFixed(0)
        }% · ${d.capacity_status||"Estimate"}
      </span>
    </div>

  `;
}

async function loadExtraPanels(){

  try{

    const [summary, alerts] =
      await Promise.all([

        fetch(
          '/api/summary',
          {cache:'no-store'}
        ).then(r=>r.json()),

        fetch(
          '/api/alerts',
          {cache:'no-store'}
        ).then(r=>r.json())

      ]);

    const cp =
      document.getElementById(
        "capacityPanel"
      );

    cp.innerHTML = `

      <div class="capacity-item">
        <span class="cap-label">
          Villages assessed
        </span>
        <strong>
          ${summary.villages}
        </strong>
      </div>

      <div class="capacity-item">
        <span class="cap-label">
          High capacity pressure
        </span>
        <strong>
          ${summary.high_capacity_pressure}
        </strong>
      </div>

      <div class="capacity-item">
        <span class="cap-label">
          Land-change alerts
        </span>
        <strong>
          ${summary.land_change_alerts}
        </strong>
      </div>

      <div class="capacity-item">
        <span class="cap-label">
          Need action
        </span>
        <strong>
          ${summary.needs_action}
        </strong>
      </div>

    `;

    const ap =
      document.getElementById(
        "alertsPanel"
      );

    ap.innerHTML =
      alerts.length

        ? alerts.map(a=>`

            <div class="alert-item">

              <i
                class="alert-dot ${a.severity}"
              ></i>

              <div>

                <strong>
                  ${a.village} · ${a.severity}
                </strong>

                <span>
                  ${a.message}
                  Land change:
                  ${a.land_change}%
                </span>

              </div>

            </div>

          `).join("")

        : `
          <p
            style="color:var(--muted);font-size:13px;"
          >
            No active alerts in current prototype data.
          </p>
        `;

    document.getElementById(
      "systemStatus"
    ).textContent =
      "✓ Backend online · scoring engine online · field analysis endpoint online";

  }catch(e){

    document.getElementById(
      "systemStatus"
    ).textContent =
      "⚠ Backend unavailable — showing dashboard fallback data.";

  }
}

async function loadLatestEvidence(){

  try{

    const x =
      await fetch(
        '/api/summary',
        {cache:'no-store'}
      ).then(r=>r.json());

    const latest =
      x.latest_analysis;

    const box =
      document.getElementById(
        "evidencePanel"
      );

    if(!latest || !latest.result){

      box.innerHTML =
        '<p style="color:var(--muted);font-size:13px;">No field analysis has been submitted in this session.</p>';

      return;
    }

    const n =
      latest.result.normalized || {};

    const files =
      n.files || {};

    const evidence =
      files.evidence || "";

    box.innerHTML = `

      <div class="evidence-metrics">

        <div class="evidence-metric">

          <span>
            Village
          </span>

          <strong>
            ${latest.village}
          </strong>

        </div>

        <div class="evidence-metric">

          <span>
            Change
          </span>

          <strong>
            ${
              Number(
                n.change_percentage||0
              ).toFixed(2)
            }%
          </strong>

        </div>

        <div class="evidence-metric">

          <span>
            Confidence
          </span>

          <strong>
            ${
              Number(
                n.confidence||0
              ).toFixed(1)
            }%
          </strong>

        </div>

      </div>

      ${
        evidence
          ? `<img
              class="evidence-thumb"
              src="${evidence}"
              alt="Latest field evidence report"
            >`
          : ""
      }

    `;

  }catch(e){}

}

function selectVillage(name){

  activeVillage = name;

  renderVillageGrid();
  renderWorklist();
  renderDetail();
}

function setUpdatedTime(){

  const now =
    new Date();

  document.getElementById(
    "updatedText"
  ).textContent =
    "Updated " +
    now.toLocaleDateString(
      undefined,
      {
        day:"2-digit",
        month:"short",
        year:"numeric"
      }
    );
}

loadData();
loadExtraPanels();
loadLatestEvidence();

// ---------- WHAT-IF Q&A SIMULATOR (village-specific + rank change) ----------

function populateQAVillageDropdown() {
  const sel = document.getElementById('qaVillage');
  if (!sel || !data.length) return;
  sel.innerHTML = data.map(d => `<option value="${d.village}">${d.village.replaceAll('_',' ')}</option>`).join('');
  if (activeVillage) sel.value = activeVillage;
}

document.getElementById('qaAskBtn').addEventListener('click', askWhatIf);
document.getElementById('qaResetBtn').addEventListener('click', () => {
  document.getElementById('qaValue').value = 30;
  document.getElementById('qaFactor').value = 'drainage';
  document.getElementById('qaAnswer').innerHTML =
    '<span style="color:var(--muted);">Choose a village and a scenario, then click Ask.</span>';
});

function askWhatIf() {
  const villageName = document.getElementById('qaVillage').value;
  const village = data.find(d => d.village === villageName);
  if (!village) {
    document.getElementById('qaAnswer').innerHTML = "Please select a village.";
    return;
    
  }

  const factor = document.getElementById('qaFactor').value;
  const pct = Number(document.getElementById('qaValue').value) / 100;

  let newSlope = village.slope;
  let newRainfall = village.rainfall;
  let newAccessScore = village.access_score;
  let newPopulation = village.population;
  let questionText = "";

  if (factor === 'drainage') {
    newRainfall = Math.max(0, village.rainfall * (1 - pct * 0.5));
    questionText = `drainage improves by ${(pct*100).toFixed(0)}%`;
  } else if (factor === 'slope') {
    newSlope = Math.max(0, village.slope * (1 - pct * 0.4));
    questionText = `slope stabilization improves by ${(pct*100).toFixed(0)}%`;
  } else if (factor === 'access') {
    newAccessScore = Math.min(1, village.access_score + pct * 0.5);
    questionText = `access improves by ${(pct*100).toFixed(0)}%`;
  } else if (factor === 'population') {
    newPopulation = Math.max(0, village.population * (1 + pct));
    questionText = `population changes by ${(pct*100).toFixed(0)}%`;
  }

  const newHazard = Math.min(1, 0.40 * newSlope + 0.35 * newRainfall + 0.25 * (village.land_change || 0));
  const maxPop = Math.max(...data.map(d => d.population));
  const newPopNorm = newPopulation / maxPop;
  const newAccessFactor = 1 - newAccessScore;
  const newRelocation = Math.min(1, 0.85 * newHazard + 0.10 * newPopNorm + 0.05 * newAccessFactor);

  let newAction;
  if (newHazard > 0.75) newAction = "Immediate Verification";
  else if (newHazard > 0.55) newAction = "Relocation Assessment";
  else if (newHazard > 0.35) newAction = "Enhanced Monitoring";
  else newAction = "Routine Monitoring";

  // ---- RANK CHANGE CALCULATION (poore worklist mein priority kaha badli) ----
  const originalSorted = [...data].sort((a,b) => b.relocation_score - a.relocation_score);
  const oldRank = originalSorted.findIndex(d => d.village === villageName) + 1;

  const simulatedList = data.map(d =>
    d.village === villageName ? { ...d, relocation_score: newRelocation } : d
  );
  const newSorted = simulatedList.sort((a,b) => b.relocation_score - a.relocation_score);
  const newRank = newSorted.findIndex(d => d.village === villageName) + 1;

  const rankChanged = newRank !== oldRank;
  const actionChanged = newAction !== village.recommended_action;

  // Kis-kis se aage/peeche hui, wo batao
  let overtakeText = "";
  if (rankChanged && newRank < oldRank) {
    const overtaken = originalSorted.slice(newRank - 1, oldRank - 1)
      .filter(d => d.village !== villageName)
      .map(d => d.village.replaceAll('_',' '));
    if (overtaken.length) {
      overtakeText = `It would now rank above: <b>${overtaken.join(', ')}</b>.`;
    }
  } else if (rankChanged && newRank > oldRank) {
    overtakeText = `It would now rank below some villages it was previously ahead of.`;
  }

  document.getElementById('qaAnswer').innerHTML = `
    <b>Q: What if ${questionText} in ${villageName.replaceAll('_',' ')}?</b><br><br>
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <tr><td style="padding:4px 0;">Hazard Score</td><td>${village.hazard_score.toFixed(3)} → <b>${newHazard.toFixed(3)}</b></td></tr>
      <tr><td style="padding:4px 0;">Relocation Score</td><td>${village.relocation_score.toFixed(3)} → <b>${newRelocation.toFixed(3)}</b></td></tr>
      <tr><td style="padding:4px 0;">Priority Rank</td><td>#${oldRank} → <b style="color:${rankChanged ? '#16a34a' : '#334155'}">#${newRank}</b></td></tr>
      <tr><td style="padding:4px 0;">Recommended Action</td><td>${village.recommended_action} → <b>${newAction}</b></td></tr>
    </table>
    ${overtakeText ? `<p style="margin-top:10px;color:#16a34a;">${overtakeText}</p>` : ""}
    ${!rankChanged && !actionChanged ? `<p style="margin-top:10px;color:var(--muted);">This change alone is not enough to shift priority — try a larger value.</p>` : ""}
  `;
  updateTerrainChart(village, newHazard);
}

// Village dropdown ko data load hone ke baad bharo

// ---------- TERRAIN VISUALIZATION (real slope/hazard driven) ----------
let terrainChart;
const terrainLabels = ["Ridge","Slope 1","Slope 2","Village","Access Road","Valley","Safe Zone"];

function generateTerrainProfile(village){
  const steepness = village.slope;
  const peak = 1000, valley = 200, n = terrainLabels.length;
  const points = [];
  for (let i = 0; i < n; i++){
    const t = i/(n-1);
    const eased = Math.pow(t, 1 + steepness*2);
    points.push(Math.round(peak - eased*(peak-valley)));
  }
  return points;
}

function generateHazardZone(village, hazardOverride){
  const hazard = hazardOverride !== undefined ? hazardOverride : village.hazard_score;
  const profile = generateTerrainProfile(village);
  if (hazard <= 0.35) return profile.map(()=>null);
  const intensity = (hazard - 0.35) / 0.65;
  return profile.map((elev,i)=> i < 3 ? elev + intensity*250*(1-i*0.25) : null);
}

function initTerrainChart(village){
  const canvas = document.getElementById('terrainChartCanvas');
  if (!canvas || !village) return;
  const ctx = canvas.getContext('2d');
  if (terrainChart) terrainChart.destroy();
  terrainChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: terrainLabels,
      datasets: [
        { label:'Terrain Profile', data: generateTerrainProfile(village), borderColor:'#94a3b8', backgroundColor:'rgba(148,163,184,0.2)', fill:true, tension:0.3 },
        { label:'Hazard Zone', data: generateHazardZone(village), borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.45)', fill:true, pointRadius:0 }
      ]
    },
    options: { responsive:true, scales:{ y:{min:0,max:1100} } }
  });
}

function updateTerrainChart(village, newHazard){
  if (!terrainChart){ initTerrainChart(village); return; }
  terrainChart.data.datasets[1].data = generateHazardZone(village, newHazard);
  terrainChart.update();
}

window.addEventListener(
  'pageshow',
  () => {

    loadData();
    loadExtraPanels();
    loadLatestEvidence();

  }
);



  