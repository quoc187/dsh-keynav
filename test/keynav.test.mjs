/**
 * Behaviour tests for dsh-keynav against a DOM that mirrors the stock DSH card
 * markup (same data attributes, roles and footer structure).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, "..", "client.js"), "utf8");

let failures = 0;
const ok = (condition, label, detail = "") => {
  if (condition) {
    console.log(`  ok   ${label}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL ${label}${detail === "" ? "" : ` — ${detail}`}`);
};

/** Build a jsdom page, load the plugin into it and hand back the controls. */
function setup(html) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
  });
  const { window } = dom;
  let plugin;
  window.__ModuleLoader__ = { load: ({ factory }) => { plugin = factory(() => ({})); } };
  window.eval(SOURCE);
  plugin.apply({});
  return { window, dom, plugin };
}

/** Dispatch a keydown on the focused element. Returns whether it was prevented. */
function press(window, key) {
  const target = window.document.activeElement ?? window.document.body;
  const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

const frame = (window) => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const option = (label, role, checked, description) =>
  `<div data-option-row>`
  + `<button type="button" role="${role}" aria-checked="${String(checked)}" aria-label="${label}">${label}</button>`
  + (description ? `<button type="button" class="chevron" aria-label="Expand description">v</button>` : '')
  + `</div>`;

const card = ({ options, multi, progress = "1 / 1", review = false, withField = false }) => {
  const [step, total] = progress.split("/").map((part) => Number(part.trim()));
  return `
  <div data-question-key="q1">
    <section aria-labelledby="q">
      <div data-question-scroll>
        <div><h2 id="q">Pick</h2></div>
        <div role="${multi ? "group" : "radiogroup"}">
          ${options.map((o) => option(o.label, multi ? "checkbox" : "radio", o.checked, o.description)).join("")}
          ${withField ? `<div class="customRow"><textarea></textarea></div>` : ""}
        </div>
      </div>
      <footer>
        <div class="pager"><button type="button" data-nav="prev"${step <= 1 ? " disabled" : ""}>prev</button><span>${progress}</span><button type="button" data-nav="next"${step >= total ? " disabled" : ""}>next</button></div>
        <div role="status"></div>
        ${review ? "" : `<div class="footerActions"><button type="button">Skip</button><button type="button" id="submit">Submit</button></div>`}
      </footer>
    </section>
  </div>`;
};

/** Wire click handlers that behave like the stock card's state. */
function wire(window) {
  const doc = window.document;
  const clicks = [];
  const progress = doc.querySelector("footer span");
  // The stock card advances to the next question when a radio is clicked and
  // this is not the last one; mirror that by moving the "n / m" marker.
  const advance = () => {
    if (progress === null) return;
    const match = /^(\d+)\s*\/\s*(\d+)$/.exec(progress.textContent.trim());
    if (match === null) return;
    if (Number(match[1]) >= Number(match[2])) return;
    progress.textContent = `${Number(match[1]) + 1} / ${match[2]}`;
  };
  for (const button of doc.querySelectorAll("[data-option-row] > button")) {
    button.addEventListener("click", () => {
      clicks.push(button.getAttribute("aria-label"));
      const multi = button.getAttribute("role") === "checkbox";
      if (multi) {
        const next = button.getAttribute("aria-checked") !== "true";
        button.setAttribute("aria-checked", String(next));
        return;
      }
      for (const peer of doc.querySelectorAll('[role="radio"]')) peer.setAttribute("aria-checked", "false");
      button.setAttribute("aria-checked", "true");
      advance();
    });
  }
  const submit = doc.querySelector("#submit");
  if (submit !== null) submit.addEventListener("click", () => clicks.push("SUBMIT"));

  const prevButton = doc.querySelector('[data-nav="prev"]');
  const nextButton = doc.querySelector('[data-nav="next"]');
  const moveTo = (value) => {
    progress.textContent = value;
    const match = /^(\d+)\s*\/\s*(\d+)$/.exec(value.trim());
    if (match === null) return;
    prevButton.disabled = Number(match[1]) <= 1;
    nextButton.disabled = Number(match[1]) >= Number(match[2]);
  };
  for (const nav of doc.querySelectorAll("[data-nav]")) {
    nav.addEventListener("click", () => {
      const match = /^(\d+)\s*\/\s*(\d+)$/.exec(progress.textContent.trim());
      if (match === null) return;
      const direction = nav.dataset.nav === "next" ? 1 : -1;
      clicks.push(`NAV:${nav.dataset.nav}`);
      moveTo(`${Number(match[1]) + direction} / ${match[2]}`);
    });
  }
  return clicks;
}

/* ------------------------------------------------------------------ */
/* question card — multi select                                        */
/* ------------------------------------------------------------------ */
{
  console.log("multi-select question");
  const { window } = setup(
    card({ multi: true, withField: true, options: [{ label: "Alpha" }, { label: "Bravo" }, { label: "Charlie" }] }),
  );
  const clicks = wire(window);
  window.document.body.querySelector("[data-question-key]").dispatchEvent(new window.Event("x"));
  await frame(window);
  await tick();

  ok(window.document.activeElement?.getAttribute("aria-label") === "Alpha", "first option is focused on mount", window.document.activeElement?.outerHTML ?? "none");

  const style = window.document.querySelector("style[data-dsh-keynav]");
  ok(style !== null, "focus stylesheet is injected");
  ok(style !== null && style.textContent.includes("outline: none !important"), "option buttons drop the UA ring");
  ok(style !== null && style.textContent.includes(":focus-within"), "the focused row takes the hover background");
  ok(window.document.querySelectorAll("style[data-dsh-keynav]").length === 1, "stylesheet is injected once");

  ok(press(window, "ArrowDown") === true, "ArrowDown is consumed");
  ok(window.document.activeElement?.getAttribute("aria-label") === "Bravo", "ArrowDown moves to Bravo");
  press(window, "ArrowDown");
  ok(window.document.activeElement?.getAttribute("aria-label") === "Charlie", "ArrowDown moves to Charlie");

  // Space is left to native activation; the plugin must not swallow it.
  ok(press(window, " ") === false, "Space is not prevented");
  window.document.activeElement.click();
  ok(window.document.activeElement.getAttribute("aria-checked") === "true", "Space toggles the option on");
  window.document.activeElement.click();
  ok(window.document.activeElement.getAttribute("aria-checked") === "false", "second activation toggles it off");

  ok(press(window, "Enter") === true, "Enter is consumed");
  ok(clicks.includes("SUBMIT"), "Enter submits the multi-select answer");

  press(window, "2");
  ok(clicks.includes("Bravo"), "digit 2 activates the second option");
}

/* ------------------------------------------------------------------ */
/* question card — single select, last question                        */
/* ------------------------------------------------------------------ */
{
  console.log("single-select question, single question");
  const { window } = setup(
    card({ multi: false, options: [{ label: "One" }, { label: "Two" }] }),
  );
  const clicks = wire(window);
  await frame(window);
  await tick();

  ok(window.document.activeElement?.getAttribute("aria-label") === "One", "first radio is focused");
  press(window, "ArrowDown");
  ok(window.document.activeElement?.getAttribute("aria-label") === "Two", "ArrowDown moves the radio");

  press(window, "Enter");
  await tick();
  ok(clicks.includes("Two"), "Enter commits the highlighted radio", JSON.stringify(clicks));
  ok(clicks.includes("SUBMIT"), "Enter then submits on the last question", JSON.stringify(clicks));
}

/* ------------------------------------------------------------------ */
/* question card — single select that advances                         */
/* ------------------------------------------------------------------ */
{
  console.log("single-select question that advances");
  const { window } = setup(
    card({ multi: false, progress: "1 / 2", options: [{ label: "One" }, { label: "Two" }] }),
  );
  const clicks = wire(window);
  await frame(window);
  await tick();

  press(window, "Enter");
  await tick();
  ok(clicks.includes("One"), "Enter commits the highlighted radio");
  ok(!clicks.includes("SUBMIT"), "Enter does not also submit when the card advances", JSON.stringify(clicks));
}

/* ------------------------------------------------------------------ */
/* textarea keeps native editing                                       */
/* ------------------------------------------------------------------ */
{
  console.log("free-text row and the ring");
  const { window } = setup(
    card({ multi: true, withField: true, options: [{ label: "Alpha" }, { label: "Bravo" }, { label: "Charlie" }] }),
  );
  wire(window);
  await frame(window);
  await tick();

  const field = window.document.querySelector("textarea");
  const active = () => window.document.activeElement?.getAttribute("aria-label") ?? window.document.activeElement?.tagName;

  ok(active() === "Alpha", "focus starts on the first option");
  press(window, "ArrowUp");
  ok(active() === "TEXTAREA", "ArrowUp past the first option wraps to the free-text row", String(active()));

  press(window, "ArrowDown");
  ok(active() === "Alpha", "ArrowDown from an empty field wraps to the first option", String(active()));

  for (const label of ["Bravo", "Charlie"]) press(window, "ArrowDown");
  ok(active() === "Charlie", "walks the options", String(active()));
  press(window, "ArrowDown");
  ok(active() === "TEXTAREA", "ArrowDown past the last option enters the free-text row");

  field.value = "abc";
  field.setSelectionRange(1, 1);
  ok(press(window, "ArrowDown") === false, "mid-text ArrowDown stays native");
  ok(press(window, "ArrowUp") === false, "mid-text ArrowUp stays native");

  field.setSelectionRange(0, 0);
  ok(press(window, "ArrowUp") === true, "ArrowUp at the caret start leaves the field");
  ok(active() === "Charlie", "and lands on the previous ring item", String(active()));

  field.focus();
  field.setSelectionRange(3, 3);
  ok(press(window, "ArrowDown") === true, "ArrowDown at the caret end leaves the field");
  ok(active() === "Alpha", "and wraps to the first option", String(active()));

  field.focus();
  ok(press(window, "Enter") === false, "Enter stays native inside the textarea");
}

/* ------------------------------------------------------------------ */
/* approval + plan review panels                                       */
/* ------------------------------------------------------------------ */
{
  console.log("approval panel");
  const { window } = setup(`
    <div data-approval-key="a1">
      <div>
        <div class="strip">waiting</div>
        <div class="body" tabindex="0" role="group">Run rm -rf?</div>
        <div class="actionRow"><button type="button">Reject</button><button type="button">Allow once</button></div>
      </div>
    </div>`);
  await frame(window);
  await tick();

  ok(window.document.activeElement?.textContent === "Allow once", "primary action is focused", window.document.activeElement?.outerHTML ?? "none");
  press(window, "ArrowLeft");
  ok(window.document.activeElement?.textContent === "Reject", "ArrowLeft moves to Reject");
  press(window, "ArrowRight");
  ok(window.document.activeElement?.textContent === "Allow once", "ArrowRight moves back");
}

{
  console.log("plan review panel");
  const { window } = setup(`
    <div data-plan-review-key="p1">
      <section>
        <div class="strip">Plan<input type="button" value="view" /></div>
        <div class="summary"><h3>Plan title</h3></div>
        <footer>
          <div role="status"></div>
          <div class="actions"><button type="button">Discuss</button><button type="button">Approve</button></div>
        </footer>
      </section>
    </div>`);
  await frame(window);
  await tick();

  ok(window.document.activeElement?.textContent === "Approve", "approve is focused", window.document.activeElement?.outerHTML ?? "none");
  press(window, "ArrowLeft");
  ok(window.document.activeElement?.textContent === "Discuss", "ArrowLeft moves to Discuss");
}

/* ------------------------------------------------------------------ */
/* description chevrons must never become navigation targets           */
/* ------------------------------------------------------------------ */
{
  console.log("options with description toggles");
  const { window } = setup(
    card({
      multi: true,
      options: [
        { label: "Alpha", description: true },
        { label: "Bravo", description: true },
        { label: "Charlie", description: true },
      ],
    }),
  );
  const clicks = wire(window);
  await frame(window);
  await tick();

  ok(window.document.activeElement?.getAttribute("aria-label") === "Alpha", "first choice is focused");
  press(window, "ArrowDown");
  ok(window.document.activeElement?.getAttribute("aria-label") === "Bravo", "ArrowDown skips the chevron", window.document.activeElement?.getAttribute("aria-label") ?? "none");
  press(window, "2");
  ok(clicks.includes("Bravo"), "digit 2 picks the second choice, not a chevron", JSON.stringify(clicks));
}

/* ------------------------------------------------------------------ */
/* focus lost to body still navigates                                   */
/* ------------------------------------------------------------------ */
{
  console.log("focus lost to body");
  const { window } = setup(
    card({ multi: true, options: [{ label: "Alpha" }, { label: "Bravo" }] }),
  );
  wire(window);
  await frame(window);
  await tick();

  window.document.activeElement.blur();
  ok(window.document.activeElement === window.document.body, "focus is on body");
  ok(press(window, "ArrowDown") === true, "ArrowDown is still consumed");
  ok(window.document.activeElement?.getAttribute("aria-label") === "Alpha", "ArrowDown recovers focus onto the first choice");
  press(window, "ArrowDown");
  ok(window.document.activeElement?.getAttribute("aria-label") === "Bravo", "navigation continues afterwards");
}

/* ------------------------------------------------------------------ */
/* left / right change step, without wrapping                          */
/* ------------------------------------------------------------------ */
{
  console.log("step navigation");
  const { window } = setup(
    card({ multi: false, progress: "1 / 2", options: [{ label: "One" }, { label: "Two" }, { label: "Three" }] }),
  );
  const clicks = wire(window);
  await frame(window);
  await tick();

  ok(press(window, "ArrowRight") === true, "ArrowRight is consumed");
  ok(clicks.includes("NAV:next"), "ArrowRight moves to the next question", JSON.stringify(clicks));
  ok(window.document.querySelector("footer span").textContent.trim() === "2 / 2", "progress advanced");
  ok(press(window, "ArrowRight") === false || !clicks.filter(c => c === "NAV:next")[1], "ArrowRight on the last step does not wrap");

  clicks.length = 0;
  press(window, "ArrowLeft");
  ok(clicks.includes("NAV:prev"), "ArrowLeft moves back", JSON.stringify(clicks));
}

{
  console.log("step navigation does not cycle");
  const { window } = setup(
    card({ multi: false, progress: "1 / 1", options: [{ label: "One" }, { label: "Two" }] }),
  );
  const clicks = wire(window);
  await frame(window);
  await tick();

  press(window, "ArrowLeft");
  press(window, "ArrowRight");
  ok(clicks.filter((entry) => entry.startsWith("NAV:")).length === 0, "single-question card never pages", JSON.stringify(clicks));
}

/* ------------------------------------------------------------------ */
/* left / right leave the input only from its edges                    */
/* ------------------------------------------------------------------ */
{
  console.log("field edges drive step navigation");
  const { window } = setup(
    card({ multi: true, withField: true, progress: "2 / 3", options: [{ label: "Alpha" }] }),
  );
  const clicks = wire(window);
  await frame(window);
  await tick();

  const field = window.document.querySelector("textarea");
  field.value = "hello";
  field.focus();

  field.setSelectionRange(2, 2);
  ok(press(window, "ArrowLeft") === false, "mid-text ArrowLeft stays native");
  ok(press(window, "ArrowRight") === false, "mid-text ArrowRight stays native");

  field.setSelectionRange(0, 0);
  ok(press(window, "ArrowLeft") === true, "ArrowLeft at the caret start is consumed");
  ok(clicks.includes("NAV:prev"), "and moves to the previous question", JSON.stringify(clicks));

  field.setSelectionRange(5, 5);
  ok(press(window, "ArrowRight") === true, "ArrowRight at the caret end is consumed");
  ok(clicks.includes("NAV:next"), "and moves to the next question", JSON.stringify(clicks));
}

console.log("");
if (failures > 0) {
  console.log(`${failures} failure(s)`);
  process.exit(1);
}
console.log("all keyboard navigation checks passed");
