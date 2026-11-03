import { describe, expect, it } from "vitest";
import { parseDiaryBody } from "./diary-body-parser";

describe("Diary body extraction", () => {
  it("parses the legacy sections, keyword delimiters, tag aliases and zero importance", () => {
    expect(parseDiaryBody("【标题】 一天\n【正文】\n第一段\n\n第二段🦉\n【关键词】猫, 花，雨、猫\n【重要性】0\n【标签】共同经历、情感时刻、约定、承诺、喜好/雷区、关系里程碑"))
      .toEqual({ title: "一天", content: "第一段\n\n第二段🦉", keywords: ["猫", "花", "雨"], importance: 0, tags: ["shared_moment", "emotion", "preference", "promise", "milestone"] });
  });
  it.each(["【正文】只有正文", "【正文】\n只有正文", "**【正文】** 只有正文", "### 【正文】只有正文"])("accepts body-only output without optional fields: %s", text => {
    expect(parseDiaryBody(text)).toEqual({ title: "", content: "只有正文", keywords: [], importance: null, tags: [] });
  });
  it("supports compact markers, optional fields before body and CRLF", () => {
    expect(parseDiaryBody("先给你这份日记。\r\n【标题】标题【关键词】甲，乙【正文】第一段\r\n第二段"))
      .toMatchObject({ title: "标题", keywords: ["甲", "乙"], content: "第一段\r\n第二段" });
  });
  it("does not reject a valid body when optional metadata repeats", () => {
    expect(parseDiaryBody("【正文】正文\n【标题】初稿\n【标题】修订标题")).toMatchObject({ title: "修订标题", content: "正文" });
  });
  it.each([[-2, 0], [1.8, 1], [0.6, 0.6]])("clamps importance %s to %s", (value, expected) => {
    expect(parseDiaryBody(`【正文】正文\n【重要性】${value}`)?.importance).toBe(expected);
  });
  it.each(["", "NaN", "Infinity", "不确定", "0.8abc"])("ignores malformed optional importance: %s", value => {
    expect(parseDiaryBody(`【正文】正文\n【重要性】${value}`)?.importance).toBeNull();
  });
  it.each(["你好，今天怎么样？", "我可以帮你写日记。", "标题：今天\n今天一起散步。", "【标题】还没有正文", "请用【正文】标记正文。", "例如【正文】这只是例子", "> 【正文】引用的格式", "```text\n【正文】示例\n```", "~~~\n【正文】示例\n~~~", "【正文】\n【关键词】空正文", "【正文】\u0085\u001c", "【正文】\n\n【正文】\n\t"])("rejects chat, examples and empty bodies: %s", text => {
    expect(parseDiaryBody(text)).toBeNull();
  });
  it("preserves code inside an explicit body and does not treat its labels as metadata", () => {
    const content = "第一段\n```\n【标签】这行属于正文\n```\n尾段";
    expect(parseDiaryBody(`【正文】${content}\n【标签】emotion,重要事件`)).toMatchObject({ content, tags: ["life_event", "emotion"] });
  });
  it("preserves free Markdown, paragraph spacing, indentation and hard line breaks", () => {
    const content = "# 今天\n\n**一起散步**  \n继续这一段\n\n\n- 听风\n  - 看树\n\n    const diary = true;\n\n【心情】安静\n> 引用中的【标题】保留\n";
    expect(parseDiaryBody(`【正文】\n${content}`)?.content).toBe(content);
  });
  it.each(["**开头加粗**", "# 开头标题", "- 第一项\n- 第二项", "    首行缩进代码"])("preserves Markdown directly after the body marker: %s", content => {
    expect(parseDiaryBody(`【正文】${content}`)?.content).toBe(content);
  });
  it("keeps inline known and unknown markers in prose instead of splitting the body", () => {
    const content = "我们聊到【标题】和【关键词】，还有【天气】；`【正文】`是一个示例。";
    expect(parseDiaryBody(`【正文】${content}\n【关键词】散步，风`)).toMatchObject({ content, keywords: ["散步", "风"] });
  });
  it("merges multiple bodies in appearance order without reflowing their paragraphs", () => {
    expect(parseDiaryBody("【标题】一天\n【正文】第一段\n\n第二段  \n【关键词】甲，乙\n【正文】\n## 后来\n\n- 走路\n\n\n【正文】**最后**\n【标签】共同经历"))
      .toMatchObject({ title: "一天", content: "第一段\n\n第二段  \n## 后来\n\n- 走路\n\n\n**最后**", keywords: ["甲", "乙"], tags: ["shared_moment"] });
  });
  it("ignores empty blocks when another body is valid", () => {
    expect(parseDiaryBody("【正文】\n【正文】有效正文\n【正文】")?.content).toBe("有效正文\n");
  });
  it("keeps CRLF, trailing spaces and blank lines within the extracted body", () => {
    const content = "第一段  \r\n\r\n\r\n- 第二段  \r\n\r\n";
    expect(parseDiaryBody(`【正文】\r\n${content}`)?.content).toBe(content);
    expect(parseDiaryBody(`【正文】\r\n${content}【标签】共同经历`)?.content).toBe(content.slice(0, -2));
  });
  it("does not drop a body when optional metadata is malformed or absent", () => {
    expect(parseDiaryBody("【重要性】不是数值\n【标题】\n【正文】自由正文\n\n**加粗**\n【关键词】\n【标签】未知"))
      .toEqual({ title: "", content: "自由正文\n\n**加粗**", importance: null, keywords: [], tags: [] });
  });
  it.each([
    "    【正文】缩进代码", "\t【正文】制表符代码", "  > **【正文】** 引用示例", "> > 【正文】嵌套引用",
    "`【正文】行内代码`", "【标题】示例 `【正文】内容`", "【标题】示例 ``【正文】内容``",
    "````md\n```\n【正文】仍在四反引号代码块中\n````",
    "~~~md\n~~\n【正文】仍在波浪线代码块中\n~~~",
    "```md\n```不是闭合围栏\n【正文】仍在代码块中\n```",
  ])("does not extract markers in code or quoted examples: %s", text => {
    expect(parseDiaryBody(text)).toBeNull();
  });
  it("finds real bodies after fenced and quoted examples and retains examples inside the body", () => {
    const content = "> 【正文】这是正文引用\n\n````md\n```\n【正文】这是正文里的代码\n````\n\n末段";
    expect(parseDiaryBody(`~~~\n【正文】格式示例\n~~~\n> 【正文】引用示例\n\n【正文】\n${content}`)?.content).toBe(content);
  });
});
