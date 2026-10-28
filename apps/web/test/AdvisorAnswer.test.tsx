import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdvisorAnswer } from "../src/components/AdvisorAnswer";

describe("AdvisorAnswer", () => {
  it("renders markdown with the non-medical notice", () => {
    render(<AdvisorAnswer answer={"### Idea\n* **Lentil** bowl"} source="passio" />);
    expect(screen.getByRole("heading", { name: "Idea" })).toBeInTheDocument();
    expect(screen.getByText("Lentil").tagName).toBe("STRONG");
    expect(screen.getByRole("note")).toHaveTextContent(/not medical advice/);
  });

  it("shows raw HTML as inert text and never creates the element", () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const { container } = render(<AdvisorAnswer answer={'Try this <img src=x onerror="alert(1)"> <script>alert(2)</script>'} source="passio" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it("does not load markdown images and opens links safely", () => {
    const { container } = render(<AdvisorAnswer answer={"![tracker](https://example.com/p.png) [site](https://example.com)"} source="passio" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("[image: tracker]")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "site" });
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("labels mock answers", () => {
    render(<AdvisorAnswer answer="hello" source="mock" />);
    expect(screen.getByText("MOCK DATA")).toBeInTheDocument();
  });
});
