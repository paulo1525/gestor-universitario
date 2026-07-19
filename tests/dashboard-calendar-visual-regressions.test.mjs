import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../components/personal-dashboard.tsx", import.meta.url), "utf8");
const dashboardStyles = await readFile(new URL("../components/personal-dashboard.module.css", import.meta.url), "utf8");
const subscription = await readFile(new URL("../components/calendar-subscription.tsx", import.meta.url), "utf8");
const calendarStyles = await readFile(new URL("../components/academic-calendar.module.css", import.meta.url), "utf8");
const forumTheme = await readFile(new URL("../app/theme-forum.css", import.meta.url), "utf8");

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

function cssRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
}

test("dashboard date cards are locale-safe and do not repeat event descriptions", () => {
  assert.match(dashboard, /formatToParts\(date\)/);
  assert.doesNotMatch(dashboard, /date\?\.split\(" "\)/);
  assert.match(dashboard, /<time className=\{styles\.dateBox\} dateTime=/);
  assert.match(dashboard, /kind === "event" \? item\.label/);
});

test("dashboard panels expose responsive navigation and labelled sections", () => {
  assert.match(dashboard, /aria-labelledby=\{titleId\}/);
  assert.match(dashboard, /className=\{styles\.viewAll\}/);
  assert.match(dashboardStyles, /@media \(max-width: 480px\)/);
  assert.match(dashboardStyles, /\.summaryCard:focus-visible/);
});

test("dashboard list cards expose a single destination action without repeating the empty-state CTA", () => {
  const listPanel = sourceBetween(dashboard, "const listPanel =", "return <AppShell");
  const emptyState = sourceBetween(listPanel, ": <div className={styles.empty}", "</div>}");
  const viewAllLabels = listPanel.match(/t\("personalDashboard\.viewAll"\)/g) || [];

  assert.equal(viewAllLabels.length, 1, "each list panel must render its destination only once");
  assert.doesNotMatch(emptyState, /<Link\b/, "an empty panel must not repeat the header action");
  assert.doesNotMatch(emptyState, /ArrowUpRight/, "an empty panel must not suggest a second action");
});

test("dashboard panel chrome and empty states remain visually compact", () => {
  const panelBar = cssRule(dashboardStyles, ".panelBar");
  const panelIcon = cssRule(dashboardStyles, ".panelIcon");
  const emptyState = cssRule(dashboardStyles, ".empty,\n.loading,\n.error");
  const headerHeight = panelBar.match(/min-height:\s*(\d+)px/);
  const emptyHeight = emptyState.match(/min-height:\s*(\d+)px/);
  const iconRadius = panelIcon.match(/border-radius:\s*([^;]+)/);
  const iconBackground = panelIcon.match(/background:\s*([^;]+)/);

  assert.doesNotMatch(panelBar, /box-shadow|border-radius/, "panel headers should not look like nested cards");
  assert.doesNotMatch(panelIcon, /box-shadow/, "header icons should not create another nested card");
  if (iconRadius) assert.equal(iconRadius[1].trim(), "0", "header icons should not use card-like rounding");
  if (iconBackground) assert.match(iconBackground[1].trim(), /^(transparent|none)$/, "header icons should not use a decorative surface");
  if (headerHeight) assert.ok(Number(headerHeight[1]) <= 64, "panel headers should stay compact");
  if (emptyHeight) assert.ok(Number(emptyHeight[1]) <= 112, "empty states should not dominate the page");
});

test("forum theme styles only complete panel class tokens", () => {
  assert.match(forumTheme, /:is\(\[class\$="__panel"\], \[class\*="__panel "\]\)/);
  assert.doesNotMatch(forumTheme, /\[class\*="__panel"\]:not/);
});

test("dashboard feedback and icon-only affordances retain accessible semantics", () => {
  const listPanel = sourceBetween(dashboard, "const listPanel =", "return <AppShell");
  const emptyState = sourceBetween(listPanel, ": <div className={styles.empty}", "</div>}");

  assert.match(emptyState, /role="status"/);
  assert.match(emptyState, /className=\{styles\.stateIcon\} aria-hidden="true"/);
  assert.match(dashboard, /className=\{styles\.summaryCard\}[^>]*aria-label=/);
  assert.match(dashboard, /className=\{styles\.panel\}[^>]*aria-labelledby="dashboard-class-title"/);
  assert.match(dashboardStyles, /\.viewAll:focus-visible/);
  assert.match(dashboardStyles, /\.item:focus-visible/);
  assert.match(dashboardStyles, /\.classActions a:focus-visible/);
});

test("calendar subscription has one setup region and a separate connection manager", () => {
  assert.match(subscription, /aria-controls="calendar-subscription-panel"/);
  assert.match(subscription, /className=\{styles\.setup\}/);
  assert.match(subscription, /className=\{styles\.actionRow\}/);
  assert.match(subscription, /className=\{styles\.management\}/);
});

test("today control shares the calendar toolbar control geometry and keyboard state", () => {
  assert.match(calendarStyles, /\.monthNavigation \.todayButton \{[^}]*min-width:58px;[^}]*height:38px;[^}]*padding:0 12px;/);
  assert.match(calendarStyles, /\.monthNavigation > button:focus-visible,\.viewSwitch button:focus-visible/);
});
