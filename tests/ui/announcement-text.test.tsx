// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AnnouncementText } from "@/components/notifications/AnnouncementText";

describe("AnnouncementText", () => {
  it("shows markup literally and links only https URLs", () => {
    const { container } = render(<AnnouncementText body={"<b>x</b> javascript:alert(1) https://a.es"} />);
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://a.es");
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText(/<b>x<\/b>/)).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("whitespace-pre-wrap");
  });
});
