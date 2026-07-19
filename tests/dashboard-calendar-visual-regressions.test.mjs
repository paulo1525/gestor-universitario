import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../components/personal-dashboard.tsx", import.meta.url), "utf8");
const dashboardStyles = await readFile(new URL("../components/personal-dashboard.module.css", import.meta.url), "utf8");
const subscription = await readFile(new URL("../components/calendar-subscription.tsx", import.meta.url), "utf8");
const calendarStyles = await readFile(new URL("../components/academic-calendar.module.css", import.meta.url), "utf8");

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
