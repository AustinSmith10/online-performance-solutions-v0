import { describe, it, expect } from "vitest";
import { SSEBuffer } from "./sse";

describe("SSEBuffer", () => {
  it("returns a complete frame's data payload", () => {
    const b = new SSEBuffer();
    expect(b.push('data: {"type":"reading"}\n\n')).toEqual(['{"type":"reading"}']);
  });

  it("buffers a partial frame until its blank-line terminator arrives", () => {
    const b = new SSEBuffer();
    expect(b.push('data: {"type":"ver')).toEqual([]);
    expect(b.push('ifying"}\n\n')).toEqual(['{"type":"verifying"}']);
  });

  it("splits multiple frames delivered in one chunk", () => {
    const b = new SSEBuffer();
    expect(b.push('data: a\n\ndata: b\n\ndata: c\n\n')).toEqual(["a", "b", "c"]);
  });

  it("joins multi-line data fields and ignores non-data lines", () => {
    const b = new SSEBuffer();
    expect(b.push("event: x\ndata: line1\ndata: line2\n\n")).toEqual(["line1\nline2"]);
  });

  it("tolerates CRLF separators", () => {
    const b = new SSEBuffer();
    expect(b.push("data: hi\r\n\r\n")).toEqual(["hi"]);
  });

  it("drops an empty data frame (heartbeat) rather than emitting ''", () => {
    const b = new SSEBuffer();
    expect(b.push("data:\n\n")).toEqual([]);
  });
});
