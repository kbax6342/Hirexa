const API_BASE = "http://localhost:3000"; // change to your prod domain later

async function getProfile() {
  // easiest dev approach: store token/cookie session works if same browser
  const res = await fetch(`${API_BASE}/api/autofill/profile`, {
    credentials: "include",
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Failed to load profile");
  return data.profile;
}

async function sendToActiveTab(type, payload) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return chrome.tabs.sendMessage(tab.id, { type, ...payload });
}

function setStatus(text) {
  document.getElementById("status").textContent = text;
}

document.getElementById("autofill").onclick = async () => {
  try {
    setStatus("Loading profile...");
    const profile = await getProfile();
    setStatus("Filling...");
    await sendToActiveTab("HIREXA_AUTOFILL", { profile });
    setStatus("Done ✅");
  } catch (e) {
    setStatus(`Error: ${e.message}`);
  }
};

document.getElementById("autoapply").onclick = async () => {
  try {
    setStatus("Loading profile...");
    const profile = await getProfile();
    setStatus("Filling...");
    await sendToActiveTab("HIREXA_AUTOFILL", { profile });

    // naive submit attempt (v1)
    setStatus("Trying submit...");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const btn =
          document.querySelector('button[type="submit"]') ||
          [...document.querySelectorAll("button")].find(b =>
            /submit|apply|send application|finish/i.test(b.innerText || "")
          );
        if (btn) btn.click();
      },
    });

    setStatus("Submitted (if supported) ✅");
  } catch (e) {
    setStatus(`Error: ${e.message}`);
  }
};