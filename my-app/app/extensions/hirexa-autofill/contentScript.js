function setValue(el, value) {
    if (!el || value == null) return false;
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  
  function findInput(possibleSelectors) {
    for (const sel of possibleSelectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }
  
  // very pragmatic: common field selector patterns across ATS forms
  function autofill(profile) {
    const fullName = `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim();
  
    setValue(findInput([
      'input[name*="first"]', 'input[id*="first"]', 'input[autocomplete="given-name"]'
    ]), profile.firstName);
  
    setValue(findInput([
      'input[name*="last"]', 'input[id*="last"]', 'input[autocomplete="family-name"]'
    ]), profile.lastName);
  
    setValue(findInput([
      'input[type="email"]', 'input[name*="email"]', 'input[id*="email"]', 'input[autocomplete="email"]'
    ]), profile.email);
  
    setValue(findInput([
      'input[type="tel"]', 'input[name*="phone"]', 'input[id*="phone"]', 'input[autocomplete="tel"]'
    ]), profile.phone);
  
    setValue(findInput([
      'input[name*="name"]', 'input[id*="name"]', 'input[autocomplete="name"]'
    ]), fullName);
  
    setValue(findInput([
      'input[name*="address"]', 'input[id*="address"]', 'input[autocomplete="address-line1"]'
    ]), profile.address1);
  
    setValue(findInput([
      'input[name*="city"]', 'input[id*="city"]', 'input[autocomplete="address-level2"]'
    ]), profile.city);
  
    setValue(findInput([
      'input[name*="state"]', 'input[id*="state"]', 'input[autocomplete="address-level1"]'
    ]), profile.state);
  
    setValue(findInput([
      'input[name*="zip"]', 'input[id*="zip"]', 'input[autocomplete="postal-code"]'
    ]), profile.zip);
  
    setValue(findInput([
      'input[name*="linkedin"]', 'input[id*="linkedin"]'
    ]), profile.linkedinUrl);
  
    setValue(findInput([
      'input[name*="portfolio"]', 'input[id*="portfolio"]', 'input[name*="website"]'
    ]), profile.portfolioUrl);
  
    // common eligibility radios/selects are inconsistent → keep simple for v1
    return { ok: true };
  }
  
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "HIREXA_AUTOFILL") {
      const res = autofill(msg.profile);
      sendResponse(res);
    }
  });