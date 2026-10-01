/**
 * The design bar, as a check instead of a rule.
 *
 *     cd frontend && npm run design            # every preview
 *     cd frontend && npm run design -- S6-apply.html
 *
 * Every preview in this folder is opened in a real browser and measured against what the owner has already had
 * to say twice: one hero, no explainer prose, no preview scaffolding, real assets instead of grey boxes, motion
 * with a reduced-motion escape, and nothing unreadable. Run it before sending a preview, not after.
 *
 * Exit code 1 when anything fails, so it can go in CI later.
 */

import { readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/sorare/design");
const HERO_PX = 48; // "one number ≥ 48 px decides the view"
const CROWD_PX = 40; // three or four numbers this big means no hero at all
const PROSE_WORDS = 55; // a block longer than this is an explainer, and explanations live in the plan
const PHONE = { width: 390, height: 844 };
const MIN_TEXT_PX = 11; // no text under this on a desktop (the 1 Oct review: 8.5 px positions and 10.5 px names)
const MIN_TEXT_PHONE_PX = 10; // and none under this at 390 px (it had 6 and 7 px)

const files = process.argv.slice(2).length
  ? process.argv.slice(2).map((name) => (name.includes("/") || name.includes("\\") ? resolve(name) : join(HERE, name)))
  : readdirSync(HERE)
      .filter((name) => name.endsWith(".html"))
      .map((name) => join(HERE, name));

/**
 * Text drawn smaller than `min` px: the visible elements whose own text is, as "text (8.5px)". SVG text is left out (its size is in the
 * drawing's own units) and so is text only a screen reader gets.
 */
function smallText(min) {
  const found = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el instanceof SVGElement || el.closest("svg, .visually-hidden, [hidden], script, style")) continue;
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
    if (!text) continue;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (rect.width < 2 || rect.height < 2 || style.visibility === "hidden" || style.display === "none") continue;
    const size = parseFloat(style.fontSize);
    if (size < min) found.push(`${text.slice(0, 18)} (${size}px)`);
  }
  return found;
}

/** Everything that needs the page's own DOM, in one pass. */
function measure(limits) {
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();

  const big = [];
  const crowd = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el) || !own(el)) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size >= limits.hero) big.push(`${own(el).slice(0, 18)} (${Math.round(size)}px)`);
    else if (size >= limits.crowd) crowd.push(`${own(el).slice(0, 18)} (${Math.round(size)}px)`);
  }

  const toggles = [...document.querySelectorAll("button, label, a")]
    .map((el) => el.textContent.trim())
    .filter((text) => /^(pc|phone|desktop|mobile|tablet)$/i.test(text));

  const prose = [...document.querySelectorAll("p, li, div")]
    .filter((el) => visible(el))
    .map((el) => own(el))
    .filter((text) => text.split(/\s+/).filter(Boolean).length > limits.prose)
    .map((text) => `${text.slice(0, 60)}…`);

  const images = [...document.images];
  const css = [...document.styleSheets]
    .flatMap((sheet) => {
      try {
        return [...sheet.cssRules].map((rule) => rule.cssText);
      } catch {
        return [];
      }
    })
    .join("\n");

  return {
    big,
    crowd,
    toggles,
    prose,
    images: { total: images.length, loaded: images.filter((img) => img.complete && img.naturalWidth > 0).length },
    motion: /@keyframes/.test(css),
    reducedMotion: /prefers-reduced-motion/.test(css),
    // A page opts out of a rule in its own <head>, where the reason is visible:
    //   <meta name="design-check" content="no-images: a status panel has no card art">
    //   <meta name="design-check" content="record">   (a shipped preview, kept as a record)
    //   <meta name="design-check" content="small-text: a dense legend">   (text under the readable size, with the reason)
    waived: (document.querySelector('meta[name="design-check"]')?.content ?? "").toLowerCase(),
  };
}

const RECORD = ["hero", "crowd", "scaffolding", "prose", "images", "small-text"]; // what a shipped preview is excused

const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }); // axe needs a context's page
let failed = 0;

for (const file of files) {
  const page = await context.newPage();
  const crashes = [];
  page.on("pageerror", (error) => crashes.push(String(error)));
  await page.goto(pathToFileURL(file).href, { waitUntil: "networkidle" });
  await page.waitForTimeout(900); // let the entrance animations settle before measuring

  const seen = await page.evaluate(measure, { hero: HERO_PX, crowd: CROWD_PX, prose: PROSE_WORDS });
  const smallOnDesktop = await page.evaluate(smallText, MIN_TEXT_PX);
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();

  await page.setViewportSize(PHONE);
  await page.waitForTimeout(300);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const smallOnPhone = await page.evaluate(smallText, MIN_TEXT_PHONE_PX);
  await page.close();

  const waived = (rule) => seen.waived.includes(rule) || (seen.waived.includes("record") && RECORD.includes(rule));
  const problems = [];
  if (!seen.big.length && !waived("hero")) problems.push(`no hero: nothing is ${HERO_PX}px or bigger`);
  if (seen.crowd.length >= 3 && !waived("crowd")) problems.push(`${seen.crowd.length} numbers competing at ${CROWD_PX}px+: ${seen.crowd.slice(0, 4).join(", ")}`);
  if (seen.toggles.length && !waived("scaffolding")) problems.push(`preview scaffolding: ${[...new Set(seen.toggles)].join(", ")}`);
  if (seen.prose.length && !waived("prose")) problems.push(`${seen.prose.length} block(s) over ${PROSE_WORDS} words: ${seen.prose[0]}`);
  if (!seen.images.total && !waived("images")) problems.push("no images at all — grey boxes where real art belongs?");
  else if (seen.images.loaded < seen.images.total) problems.push(`${seen.images.total - seen.images.loaded} image(s) did not load`);
  if (!seen.motion) problems.push("nothing animates");
  if (seen.motion && !seen.reducedMotion) problems.push("motion with no prefers-reduced-motion escape");
  if (sideways && !waived("sideways")) problems.push("scrolls sideways at 390px");
  if (smallOnDesktop.length && !waived("small-text")) problems.push(`${smallOnDesktop.length} text(s) under ${MIN_TEXT_PX}px on a desktop: ${smallOnDesktop.slice(0, 3).join(", ")}`);
  if (smallOnPhone.length && !waived("small-text")) problems.push(`${smallOnPhone.length} text(s) under ${MIN_TEXT_PHONE_PX}px at 390px: ${smallOnPhone.slice(0, 3).join(", ")}`);
  for (const violation of scan.violations) {
    problems.push(`${violation.id}: ${violation.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("; ")}`);
  }
  for (const crash of crashes) problems.push(`script error: ${crash.slice(0, 90)}`);

  const name = basename(file);
  if (problems.length) {
    failed += 1;
    console.log(`✕ ${name}`);
    for (const problem of problems) console.log(`    ${problem}`);
  } else {
    const hero = seen.big[0] ? `hero ${seen.big[0]}` : "no hero (waived)";
    console.log(`✓ ${name}  ·  ${hero} · ${seen.images.loaded} images`);
  }
}

await context.close();
await browser.close();
console.log(failed ? `\n${failed} of ${files.length} previews are below the bar.` : `\nAll ${files.length} previews pass.`);
process.exit(failed ? 1 : 0);
