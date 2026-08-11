import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

describe("report print layout", () => {
  it("keeps compact viewport rules out of paged media", () => {
    expect(styles).toContain("@media screen and (max-width: 900px)");
    expect(styles).toContain("@media screen and (max-width: 600px)");
    expect(styles).not.toMatch(/@media \(max-width:/);
  });

  it("does not force ordinary sections to consume an almost-empty page", () => {
    const printStyles = styles.slice(styles.indexOf("@media print"));

    expect(printStyles).not.toMatch(/min-height:\s*18[04]mm/);
  });

  it("keeps the print evidence grid compact and removes the colliding running label", () => {
    const printStyles = styles.slice(styles.indexOf("@media print"));

    expect(printStyles).toContain(".print-running-header { display: none; }");
    expect(printStyles).toContain(".continued-heading { display: none; }");
    expect(printStyles).toMatch(/\.movement-scope \+ \.report-section\s*\{[^}]*break-before:\s*auto;/);
    expect(printStyles).toMatch(/\.resource-chart \+ \.report-section\s*\{[^}]*break-before:\s*auto;/);
    expect(printStyles).toMatch(/\.snapshot-card:nth-last-child\(-n \+ 2\)\s*\{\s*grid-column:\s*span 2;/);
    expect(printStyles).toMatch(/\.renderer-snapshots > \.caption\s*\{[^}]*display:\s*none;/);
    expect(printStyles).toMatch(/\.wide-chart \.timeline\s*\{[^}]*height:\s*32mm;/);
  });
});
