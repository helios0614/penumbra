import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { mapMessage } from "@/domain/message/message-mappers";
import { readonlySystemWire } from "@/test-fixtures/readonly-conversation-wire";
import { ReadonlyEvent } from "./ReadonlyEvent";
import { readonlyEventPresentation } from "./readonly-event-presentation";
import { find } from "./test-utils/hook-session";

it("keeps the same public memory body in the reading area for both target and neighboring records", () => {
  const firstBody = "第一条合成公开记忆，包含完整的阅读事实。".repeat(15);
  const secondBody = "第二条合成公开记忆，内容与第一条独立保存。".repeat(15);
  const messages = [firstBody, secondBody].map((text, i) => mapMessage(readonlySystemWire(
    `synthetic-memory-${i}`, "写入记忆", "MEMORY_WRITE", [
      { label: "记忆正文", text }, { label: "重要度", text: i ? "0.5" : "0.6" },
      { label: "关键词", text: "合成关键词" }, { label: "记忆 ID", text: `synthetic-id-${i}` },
    ],
  )));
  // The public field choice is identical. The old difference came from target
  // folding behavior, not missing body data or a different segment namespace.
  expect(messages.map(m => readonlyEventPresentation(m).primary?.key)).toEqual(["display.field:0", "display.field:0"]);
  messages.forEach((message, i) => {
    const tree = ReadonlyEvent({ message, target: i === 0 });
    const body = renderToStaticMarkup(find(tree, "p"));
    const details = renderToStaticMarkup(find(tree, "details"));
    expect(body).toContain(i ? secondBody : firstBody);
    expect(body).not.toContain("context-event-preview");
    expect(details).not.toContain(i ? secondBody : firstBody);
    expect(details).toContain("合成关键词"); expect(details).toContain(`synthetic-id-${i}`);
    expect(details).not.toContain("重要度");
  });
});

it("keeps other long system bodies in place and reserves details for supplementary fields", () => {
  const text = "合成的公开系统执行说明，正文应在原位展开。".repeat(20);
  const message = mapMessage(readonlySystemWire("generic", "系统能力", "legacy-text", [
    { label: "内容", text }, { label: "补充信息", text: "允许公开的附加信息" },
  ], "unknown"));
  const tree = ReadonlyEvent({ message });
  expect(renderToStaticMarkup(find(tree, "p"))).toContain(text);
  const details = renderToStaticMarkup(find(tree, "details"));
  expect(details).not.toContain(text); expect(details).toContain("允许公开的附加信息");
});

it("still offers in-place expansion for a long generic body with no supplementary fields", () => {
  const text = "只有一段已允许公开的系统正文。".repeat(30);
  const message = mapMessage(readonlySystemWire("only-body", "系统通知", "legacy-text", [{ label: "内容", text }]));
  const tree = ReadonlyEvent({ message });
  expect(renderToStaticMarkup(find(tree, "p"))).toContain(text);
  const details = renderToStaticMarkup(find(tree, "details"));
  expect(details).toContain("查看详情"); expect(details).not.toContain("<dl"); expect(details).not.toContain(text);
});
