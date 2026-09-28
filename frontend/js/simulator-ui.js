/**
 * City Municipal Corporation & Commission Command Center
 * Hardware Tab Interactive Injector & Simulator Controls
 */

document.addEventListener("DOMContentLoaded", () => {
  const sliderOrg = document.getElementById("hwSliderOrg");
  const sliderDry = document.getElementById("hwSliderDry");
  const btnAddOrg = document.getElementById("hwBtnAddOrg");
  const btnAddDry = document.getElementById("hwBtnAddDry");
  const btnEmptyOrg = document.getElementById("hwBtnEmptyOrg");
  const btnEmptyDry = document.getElementById("hwBtnEmptyDry");
  const btnEmptyHub = document.getElementById("btnEmptyInspectedHub");

  async function pushHubReading(binType, fillVal) {
    const siteId = cityState.currentInspectedSite || "SITE_001";
    try {
      await fetch("/api/simulator/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: siteId,
          bin_type: binType,
          fill_percent: parseInt(fillVal),
          noise_cm: 0.0
        })
      });
    } catch (e) {
      console.error("Hub injector failed:", e);
    }
  }

  async function emptyHubBin(binType) {
    const siteId = cityState.currentInspectedSite || "SITE_001";
    try {
      await fetch(`/api/simulator/empty-bin?site_id=${siteId}&bin_type=${binType}`, {
        method: "POST"
      });
    } catch (e) {
      console.error("Empty failed:", e);
    }
  }

  if (sliderOrg) {
    sliderOrg.addEventListener("input", (e) => {
      const valEl = document.getElementById("hwSliderValOrg");
      if (valEl) valEl.textContent = `${e.target.value}%`;
    });
    sliderOrg.addEventListener("change", (e) => {
      pushHubReading("organic", e.target.value);
    });
  }

  if (sliderDry) {
    sliderDry.addEventListener("input", (e) => {
      const valEl = document.getElementById("hwSliderValDry");
      if (valEl) valEl.textContent = `${e.target.value}%`;
    });
    sliderDry.addEventListener("change", (e) => {
      pushHubReading("dry", e.target.value);
    });
  }

  if (btnAddOrg) {
    btnAddOrg.addEventListener("click", () => {
      const siteId = cityState.currentInspectedSite || "SITE_001";
      const current = cityState.readings[siteId]?.organic?.fill_percent || 0;
      pushHubReading("organic", Math.min(100, current + 15));
    });
  }

  if (btnAddDry) {
    btnAddDry.addEventListener("click", () => {
      const siteId = cityState.currentInspectedSite || "SITE_001";
      const current = cityState.readings[siteId]?.dry?.fill_percent || 0;
      pushHubReading("dry", Math.min(100, current + 15));
    });
  }

  if (btnEmptyOrg) {
    btnEmptyOrg.addEventListener("click", () => {
      emptyHubBin("organic");
    });
  }

  if (btnEmptyDry) {
    btnEmptyDry.addEventListener("click", () => {
      emptyHubBin("dry");
    });
  }

  if (btnEmptyHub) {
    btnEmptyHub.addEventListener("click", async () => {
      await emptyHubBin("organic");
      await emptyHubBin("dry");
      alert(`🗑️ Hub Bins Emptied: Both Organic and Dry waste bins at ${cityState.currentInspectedSite} have been cleared.`);
    });
  }
});
