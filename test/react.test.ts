/**
 * Construct-level smoke test for the React adapter. Full rendering/recovery is
 * demonstrated in examples/react-host; here we assert the public surface exists
 * and that lazyRemote produces a genuine React.lazy component (Suspense-ready)
 * without invoking the remote loader at construction time.
 */
import { describe, expect, it } from "vitest";
import {
  ResilientRemote,
  useResilientRemote,
  lazyRemote,
} from "../src/adapters/react.js";

describe("React adapter surface", () => {
  it("exports the hook and component as functions", () => {
    expect(typeof useResilientRemote).toBe("function");
    expect(typeof ResilientRemote).toBe("function");
    expect(typeof lazyRemote).toBe("function");
  });

  it("lazyRemote returns a React.lazy component (does not load eagerly)", () => {
    const C = lazyRemote<{ default: () => null }>("checkout/Cart", {
      fallback: "checkout-stable/Cart",
    });
    // React.lazy objects are tagged with the react.lazy symbol.
    expect((C as { $$typeof?: symbol }).$$typeof).toBe(Symbol.for("react.lazy"));
  });
});
