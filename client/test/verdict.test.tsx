import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VerdictCard } from "../src/components/VerdictCard";
import type { Verdict } from "../src/api/client";

const high: Verdict = {
  summary: "High risk: unlimited allowance.",
  actions: [{ kind: "approval", description: "Approves an unlimited amount." }],
  riskLevel: "high",
  reasons: [{ text: "Unlimited allowance.", evidence: ["tool:decodeCalldata", "note:std-erc20-unlimited"] }],
  citations: ["std-erc20-unlimited"],
};

describe("VerdictCard", () => {
  it("shows the risk badge, actions, reasons with evidence links and titled citations", () => {
    render(
      <VerdictCard
        verdict={high}
        status="valid"
        retrieved={[{ noteId: "std-erc20-unlimited", title: "Unlimited allowances", score: 0.5, sources: [] }]}
      />,
    );
    expect(screen.getByTestId("risk-badge")).toHaveTextContent("High risk");
    expect(screen.getByText("Approves an unlimited amount.")).toBeInTheDocument();
    const reasons = screen.getByText("Unlimited allowance.").closest("li")!;
    expect(within(reasons).getByRole("link", { name: "decodeCalldata" })).toHaveAttribute(
      "href",
      "#tool-decodeCalldata",
    );
    expect(within(reasons).getByRole("link", { name: "std-erc20-unlimited" })).toHaveAttribute(
      "href",
      "#note-std-erc20-unlimited",
    );
    expect(screen.getByRole("link", { name: "Unlimited allowances" })).toBeInTheDocument();
    expect(screen.getByText("Schema-validated")).toBeInTheDocument();
  });

  it("renders an unknown verdict without actions or reasons", () => {
    render(
      <VerdictCard
        verdict={{
          summary: "I don't know: not enough evidence.",
          actions: [],
          riskLevel: "unknown",
          reasons: [],
          citations: [],
        }}
        status="fallback"
      />,
    );
    expect(screen.getByTestId("risk-badge")).toHaveTextContent("Unknown");
    expect(screen.queryByText("Why")).toBeNull();
    expect(screen.getByText("none")).toBeInTheDocument();
    expect(screen.getByText(/fallback/)).toBeInTheDocument();
  });
});
