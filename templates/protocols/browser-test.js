/**
 * k6 Browser (Playwright) Load Test — Core Web Vitals
 *
 * Uses the built-in k6/browser module (k6 ≥ v0.52).
 * Measures LCP, CLS, INP, and TTFB via PerformanceObserver.
 *
 * Env vars:
 *   BASE_URL   – target site URL (default: http://localhost:3000)
 *   NAV_PATH   – page path to test (default: /)
 *   HEADLESS   – run headless (default: true)
 */

import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";
import { browser } from "k6/browser";

const baseUrl = __ENV.BASE_URL || "http://localhost:3000";
const navPath = __ENV.NAV_PATH || "/";
const headless = (__ENV.HEADLESS || "true") === "true";

const lcpMetric = new Trend("browser_lcp_ms", true);
const clsMetric = new Trend("browser_cls");
const inpMetric = new Trend("browser_inp_ms", true);
const ttfbMetric = new Trend("browser_ttfb_ms", true);
const pageLoads = new Counter("browser_page_loads");

export const options = {
  scenarios: {
    browser_ui: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "20s", target: 3 },
        { duration: "1m", target: 5 },
        { duration: "30s", target: 0 },
      ],
      options: {
        browser: {
          type: "chromium",
          headless,
        },
      },
    },
  },
  thresholds: {
    browser_lcp_ms: ["p(75)<2500"],
    browser_cls: ["p(75)<0.1"],
    browser_inp_ms: ["p(75)<200"],
    browser_ttfb_ms: ["p(75)<800"],
  },
};

export default async function () {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Inject PerformanceObserver before navigation to capture web vitals
    await page.evaluateOnNewDocument(() => {
      window.__k6_vitals = { lcp: 0, cls: 0, inp: Infinity };

      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) window.__k6_vitals.lcp = last.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });

      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            window.__k6_vitals.cls += entry.value;
          }
        }
      }).observe({ type: "layout-shift", buffered: true });

      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const dur = entry.processingEnd - entry.startTime;
          if (dur > window.__k6_vitals.inp || window.__k6_vitals.inp === Infinity) {
            window.__k6_vitals.inp = dur;
          }
        }
      }).observe({ type: "event", buffered: true, durationThreshold: 16 });
    });

    const url = `${baseUrl}${navPath}`;
    const response = await page.goto(url, { waitUntil: "networkidle" });
    pageLoads.add(1);

    check(response, {
      "page loaded successfully": (r) => r && r.status() === 200,
    });

    // TTFB from Navigation Timing API
    const ttfb = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      return nav ? nav.responseStart - nav.requestStart : 0;
    });
    ttfbMetric.add(ttfb);

    // Simulate user interaction for INP measurement
    await page.mouse.click(100, 100);
    sleep(1);

    // Collect web vitals
    const vitals = await page.evaluate(() => window.__k6_vitals);
    if (vitals) {
      lcpMetric.add(vitals.lcp);
      clsMetric.add(vitals.cls);
      if (vitals.inp !== Infinity) {
        inpMetric.add(vitals.inp);
      }
    }

    check(vitals, {
      "LCP under 2.5s": (v) => v && v.lcp < 2500,
      "CLS under 0.1": (v) => v && v.cls < 0.1,
    });
  } finally {
    await page.close();
    await context.close();
  }

  sleep(1);
}
