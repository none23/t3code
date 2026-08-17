import { describe, expect, it } from "vite-plus/test";

import { derivePendingUserInputOptionCopy } from "./pendingUserInputOption";

describe("derivePendingUserInputOptionCopy", () => {
  it("keeps a distinct description visible and available to assistive technology", () => {
    expect(
      derivePendingUserInputOptionCopy({
        label: "Smoke test only",
        description: "Validate the protocol without making a prevalence claim.",
      }),
    ).toEqual({
      description: "Validate the protocol without making a prevalence claim.",
      accessibilityLabel:
        "Smoke test only. Validate the protocol without making a prevalence claim.",
    });
  });

  it("hides empty and label-duplicate descriptions", () => {
    expect(
      derivePendingUserInputOptionCopy({
        label: "Continue",
        description: "Continue",
      }),
    ).toEqual({
      description: null,
      accessibilityLabel: "Continue",
    });
    expect(
      derivePendingUserInputOptionCopy({
        label: "Continue",
        description: "   ",
      }),
    ).toEqual({
      description: null,
      accessibilityLabel: "Continue",
    });
  });
});
