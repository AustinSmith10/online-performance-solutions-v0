import { describe, it, expect } from "vitest";
import { renderEmailShell, e, paragraph, fieldTable, noticeBox, quote, link, strong } from "./shell";

const base = {
  status: "info" as const,
  statusLabel: "For information",
  heading: "Something happened",
  bodyHtml: "<p>body</p>",
};

describe("renderEmailShell", () => {
  it("renders the heading, status pill, wordmark and footer", () => {
    const html = renderEmailShell(base);
    expect(html).toContain("Something happened");
    expect(html).toContain("For information");
    expect(html).toContain("DDEG&nbsp;OPS");
    expect(html).toContain("DDEG Online Performance Solution");
  });

  it("applies the app's card surface — 12px radius and a zinc-200 border", () => {
    const html = renderEmailShell(base);
    expect(html).toContain("border-radius:12px");
    expect(html).toContain("border:1px solid #e4e4e7");
  });

  it("keys the status rule and pill off the status", () => {
    expect(renderEmailShell({ ...base, status: "action" })).toContain("#d97706");
    expect(renderEmailShell({ ...base, status: "success" })).toContain("#16a34a");
    expect(renderEmailShell({ ...base, status: "error" })).toContain("#dc2626");
    expect(renderEmailShell({ ...base, status: "info" })).toContain("#2563eb");
  });

  it("renders a CTA button when one is given, and none otherwise", () => {
    const withCta = renderEmailShell({ ...base, cta: { label: "Do it", url: "https://x.test/go" } });
    expect(withCta).toContain("https://x.test/go");
    expect(withCta).toContain("Do it");
    expect(renderEmailShell(base)).not.toContain("<a href");
  });

  it("renders a footnote only when given", () => {
    expect(renderEmailShell({ ...base, footnote: "Expires soon." })).toContain("Expires soon.");
    expect(renderEmailShell(base)).not.toContain("Expires soon.");
  });

  it("escapes the heading, status label and CTA fields", () => {
    const html = renderEmailShell({
      ...base,
      heading: "<script>h</script>",
      statusLabel: "<script>s</script>",
      cta: { label: "<script>c</script>", url: 'https://x.test/"onload="alert(1)' },
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('"onload="');
  });

  it("uses tables rather than flex or grid, for Outlook", () => {
    const html = renderEmailShell(base);
    expect(html).toContain("<table");
    expect(html).not.toContain("display:flex");
    expect(html).not.toContain("display:grid");
  });
});

describe("body helpers", () => {
  it("e() escapes the HTML-significant characters", () => {
    expect(e('a & b < c > d "e"')).toBe("a &amp; b &lt; c &gt; d &quot;e&quot;");
  });

  it("paragraph() honours a custom bottom margin", () => {
    expect(paragraph("hi")).toContain("margin:0 0 16px");
    expect(paragraph("hi", 0)).toContain("margin:0 0 0px");
  });

  it("strong() escapes its input", () => {
    expect(strong("<b>")).toContain("&lt;b&gt;");
    expect(strong("<b>")).not.toContain("<b>");
  });

  it("fieldTable() renders one row per field and omits the last border", () => {
    const html = fieldTable([
      { label: "Reference", value: "OPS-1" },
      { label: "Due", value: "1 July" },
    ]);
    expect(html).toContain("Reference");
    expect(html).toContain("OPS-1");
    expect(html).toContain("Due");
    // one separator only, between the two rows
    expect(html.match(/border-bottom/g)).toHaveLength(2);
  });

  it("fieldTable() escapes labels", () => {
    expect(fieldTable([{ label: "<script>", value: "x" }])).toContain("&lt;script&gt;");
  });

  it("noticeBox() tints to the status passed", () => {
    expect(noticeBox("x", "action")).toContain("#fef3c7");
    expect(noticeBox("x", "success")).toContain("#dcfce7");
  });

  it("quote() escapes its text and renders italic", () => {
    const html = quote("<script>q</script>");
    expect(html).not.toContain("<script>q</script>");
    expect(html).toContain("font-style:italic");
  });

  it("link() escapes both label and URL", () => {
    const html = link("<b>go</b>", 'https://x.test/"x');
    expect(html).not.toContain("<b>go</b>");
    expect(html).toContain("&quot;");
  });
});
