import { describe, expect, it } from "vitest";
import { DialogTitle } from "./dialog";
import { AlertDialogTitle } from "./alert-dialog";

describe("Shared dialog title typography", () => {
  it.each([DialogTitle, AlertDialogTitle])("uses the functional sans family, 18px/28px and semibold by default", (Title) => {
    const title = Title({ children: "中文标题" });
    expect(title.props.className).toContain("font-sans text-lg font-semibold leading-7");
    expect(title.props.className).not.toMatch(/font-heading|font-decorative/);
    expect(title.props.children).toBe("中文标题");
  });
  it("continues to allow deliberate local typography overrides", () => {
    const title = DialogTitle({ children: "Title", className: "text-sm font-normal" });
    expect(title.props.className).toContain("text-sm"); expect(title.props.className).toContain("font-normal");
    expect(title.props.className).not.toContain("font-semibold");
  });
});
