// Progressive enhancement: without JS every setup panel shows and copy buttons stay hidden.
document.documentElement.classList.add("js");

for (const tabs of document.querySelectorAll("[data-tabs]")) {
  const list = tabs.querySelector('[role="tablist"]');
  const buttons = [...list.querySelectorAll('[role="tab"]')];
  const select = (btn, focus) => {
    for (const b of buttons) {
      const on = b === btn;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      document.getElementById(b.getAttribute("aria-controls")).hidden = !on;
    }
    if (focus) btn.focus();
  };
  list.hidden = false;
  select(buttons[0], false);
  list.addEventListener("click", (e) => {
    const btn = e.target.closest('[role="tab"]');
    if (btn) select(btn, false);
  });
  list.addEventListener("keydown", (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: buttons.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(buttons[(next + buttons.length) % buttons.length], true);
  });
}

if (navigator.clipboard) {
  for (const btn of document.querySelectorAll("[data-copy]")) {
    btn.hidden = false;
    btn.addEventListener("click", async () => {
      const text = btn.parentElement.querySelector("code").textContent;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "Copied";
      } catch {
        btn.textContent = "Copy failed";
      }
      setTimeout(() => (btn.textContent = "Copy"), 1500);
    });
  }
}
