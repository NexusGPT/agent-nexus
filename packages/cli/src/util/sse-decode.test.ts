import { describe, expect, it } from "vitest";

import { SseDecoder } from "./sse-decode";

describe("SseDecoder", () => {
  it("returns one payload per completed event", () => {
    const decoder = new SseDecoder();
    expect(decoder.push('data: {"type":"lines"}\n\n')).toEqual(['{"type":"lines"}']);
  });

  it("holds an event that arrives in two chunks until it is complete", () => {
    // The case a test that owns the transport cannot reach, and the reason this
    // decoder is a module rather than a loop inside the follow.
    const decoder = new SseDecoder();
    expect(decoder.push('data: {"type":"li')).toEqual([]);
    expect(decoder.push('nes"}\n\n')).toEqual(['{"type":"lines"}']);
  });

  it("returns both payloads when one chunk carries two events", () => {
    const decoder = new SseDecoder();
    expect(decoder.push('data: {"a":1}\n\ndata: {"b":2}\n\n')).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("drops keepalive comments without emitting anything", () => {
    // `VibeSseFrameWriter` writes `: keepalive` every 15 seconds. A decoder that
    // passed it through would hand JSON.parse a colon on a healthy stream.
    const decoder = new SseDecoder();
    expect(decoder.push(": keepalive\n\n")).toEqual([]);
    expect(decoder.push(': keepalive\n\ndata: {"a":1}\n\n')).toEqual(['{"a":1}']);
  });

  it("joins several data lines of one event with a newline", () => {
    const decoder = new SseDecoder();
    expect(decoder.push("data: first\ndata: second\n\n")).toEqual(["first\nsecond"]);
  });

  it("strips exactly one leading space after the colon", () => {
    const decoder = new SseDecoder();
    expect(decoder.push("data:  two spaces\n\n")).toEqual([" two spaces"]);
    expect(decoder.push("data:none\n\n")).toEqual(["none"]);
  });

  it("ignores fields other than data", () => {
    const decoder = new SseDecoder();
    expect(decoder.push('id: 7\nevent: lines\nretry: 100\ndata: {"a":1}\n\n')).toEqual(['{"a":1}']);
  });

  it("emits nothing for an event that carried no data line", () => {
    // A blank payload and "there was nothing here" must not be the same value —
    // a caller would otherwise have to parse an empty string to tell them apart.
    const decoder = new SseDecoder();
    expect(decoder.push("id: 7\n\n")).toEqual([]);
  });

  it("reads CRLF terminators", () => {
    const decoder = new SseDecoder();
    expect(decoder.push('data: {"a":1}\r\n\r\n')).toEqual(['{"a":1}']);
  });

  it("holds a trailing CR rather than treating it as a whole terminator", () => {
    // The seam. Rewriting that lone `\r` to `\n` on sight would end the event
    // after `first` and emit TWO payloads where the wire carried one — the
    // difference between a log line and half a log line.
    const decoder = new SseDecoder();
    expect(decoder.push("data: first\r")).toEqual([]);
    expect(decoder.push("\ndata: second\r\n\r\n")).toEqual(["first\nsecond"]);
  });

  it("reads a lone CR as a terminator once something follows it", () => {
    // Every `\r` here has a byte after it except the last, which is why the
    // blank line only dispatches once the `\n` arrives to settle it.
    const decoder = new SseDecoder();
    expect(decoder.push("data: only\rdata: more\r\r")).toEqual([]);
    expect(decoder.push("\n")).toEqual(["only\nmore"]);
  });

  it("keeps an unterminated event pending rather than emitting a partial one", () => {
    const decoder = new SseDecoder();
    expect(decoder.push("data: never finished\n")).toEqual([]);
  });
});
