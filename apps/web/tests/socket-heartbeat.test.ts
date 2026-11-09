import {afterEach,describe,expect,it,vi} from "vitest";
import {SocketHeartbeat} from "../src/socket-heartbeat";

afterEach(() => vi.useRealTimers());

describe("Worker WebSocket heartbeat", () => {
  it("requires a pong within the deadline instead of trusting readyState", () => {
    vi.useFakeTimers();
    const ping = vi.fn(), lost = vi.fn();
    const heartbeat = new SocketHeartbeat(ping,lost,1_000,200);
    heartbeat.start();
    vi.advanceTimersByTime(1_000);
    expect(ping).toHaveBeenCalledTimes(1);
    expect(lost).not.toHaveBeenCalled();
    vi.advanceTimersByTime(199);
    expect(lost).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(lost).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(ping).toHaveBeenCalledTimes(1);
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it("a server pong clears the previous deadline and permits another ping", () => {
    vi.useFakeTimers();
    const ping = vi.fn(), lost = vi.fn();
    const heartbeat = new SocketHeartbeat(ping,lost,1_000,200);
    heartbeat.start();
    heartbeat.start();
    vi.advanceTimersByTime(1_000);
    heartbeat.pong();
    vi.advanceTimersByTime(200);
    expect(lost).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    expect(ping).toHaveBeenCalledTimes(2);
    heartbeat.pong();
    heartbeat.stop();
    vi.advanceTimersByTime(10_000);
    expect(lost).not.toHaveBeenCalled();
  });

  it("a failed send disconnects once, and a stopped heartbeat stays silent", () => {
    vi.useFakeTimers();
    const lost = vi.fn();
    const heartbeat = new SocketHeartbeat(() => { throw new Error("socket lost"); },lost,1_000,200);
    heartbeat.start();
    vi.advanceTimersByTime(1_000);
    expect(lost).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(lost).toHaveBeenCalledTimes(1);

    const silent = vi.fn();
    const stopped = new SocketHeartbeat(silent,lost,1_000,200);
    stopped.start();
    stopped.stop();
    vi.advanceTimersByTime(10_000);
    expect(silent).not.toHaveBeenCalled();
  });
});
