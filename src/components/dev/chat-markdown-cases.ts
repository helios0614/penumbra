/** Synthetic public content only. Imported by the DEV-only page and tests. */
export interface MarkdownCase {
  id: string;
  group: string;
  label: string;
  content: string;
  expected: string;
  bubbles: number;
  limitation?: string;
}
const fixture = (group: string, id: string, label: string, content: string, bubbles: number, expected: string, limitation?: string): MarkdownCase =>
  ({ group, id, label, content, bubbles, expected, limitation });
export const markdownCases: readonly MarkdownCase[] = [
  fixture('基础气泡', 'single', '普通单行', '合成的一行正文。', 1, '一个气泡。'),
  fixture('基础气泡', 'soft-line', '单换行', '第一行\n第二行', 1, '一个气泡；Markdown 软换行显示为空格。'),
  fixture('基础气泡', 'paragraphs', '双换行', '第一段\n\n第二段', 2, '两个普通正文气泡。'),
  fixture('基础气泡', 'blank-lines', '连续空白行', '\n\n第一段\n\n\n第二段\n\n', 2, '仍然只有两个气泡。'),
  fixture('基础气泡', 'invisible', '空格与不可见空段', '第一段\n \t\n\u200b\n\u2060\n第二段', 2, '空格、Tab、零宽字符不产生空泡。'),
  fixture('代码块', 'backtick', '三个反引号', '```ts\nconst a = 1;\n\nconst b = 2;\n```', 1, '代码及内部空行留在一个气泡，复制得到完整代码。'),
  fixture('代码块', 'tilde', '波浪线围栏', '~~~ts\nconst a = 1;\n\nconst b = 2;\n~~~', 1, '一个代码块，不出现空 Code 框。'),
  fixture('代码块', 'indented-fence', '缩进围栏', '  ```ts\n  const a = 1;\n\n  const b = 2;\n  ```', 1, '合法缩进 fence 内空行不拆泡。'),
  fixture('代码块', 'long-fence', '四反引号包三个', '````md\n# 合成预览\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n````', 1, '一个气泡，Markdown 预览中的代码保持完整。'),
  fixture('代码块', 'short-close', '闭合长度不足', '````ts\nconst a = 1;\n```\n\nconst b = 2;\n````', 1, '内部三个反引号作为代码，不能提前关闭外层。'),
  fixture('代码块', 'invalid-info', '非法 info string', '```ts`invalid\none\n\ntwo', 2, '不是合法开围栏，普通空白行照常拆泡。'),
  fixture('代码块', 'open-fence', '未闭合围栏', '```ts\nconst a = 1;\n\nconst b = 2;', 1, '按当前 Markdown 前缀，开放代码一直到 EOF；不补闭合标记。'),
  fixture('代码块', 'indent-code', '缩进代码含空行', '    const a = 1;\n\n    const b = 2;', 1, '一个缩进代码块，内部空行保留。'),
  fixture('代码块', 'code-tail', '代码后普通正文', '```ts\nconst a = 1;\n\nconst b = 2;\n```\n\n后续第一段\n\n后续第二段', 3, '代码一个泡，后续普通正文仍拆成两个泡。'),
  fixture('列表与引用', 'list', '普通列表', '- one\n- two\n  - child', 1, '列表与嵌套项在同一泡。'),
  fixture('列表与引用', 'loose-list', 'loose list 与重复 1.', '1. one\n\n1. two', 1, '一个 ol，实际编号为 1、2。'),
  fixture('列表与引用', 'list-paragraph', '多段列表项', '- one\n\n  continuation\n\n- two\n\n列表外正文', 2, '续段仍属于 li；外部正文另起一泡。'),
  fixture('列表与引用', 'nested-list', '嵌套列表与续段', '- one\n\n  - nested\n\n    continuation\n\n- two', 1, '续段属于嵌套列表，不应变成代码。'),
  fixture('列表与引用', 'quote-code', '引用内代码', '> ```ts\n> const a = 1;\n>\n> const b = 2;\n> ```', 1, '一个引用容器内的完整代码块。'),
  fixture('列表与引用', 'quote-list', '引用内列表', '> - one\n>\n>   continuation\n>\n> - two', 1, '引用内列表的多段结构不拆泡。'),
  fixture('列表与引用', 'separate-quotes', '引用之间空白分隔', '> 第一处引用\n\n> 第二处引用', 2, 'Markdown 本来是两个引用，保持两个泡。'),
  fixture('表格', 'short-table', '普通短表格', '| A | B |\n| :- | -: |\n| one | two |', 1, '自然展示短表格，保留对齐。'),
  fixture('表格', 'wide-table', '12 列宽表格', [
    '| ' + Array.from({ length: 12 }, (_, i) => 'column' + i).join(' | ') + ' |',
    '| ' + Array(12).fill('---').join(' | ') + ' |',
    '| ' + Array(12).fill('longcontent').join(' | ') + ' |',
  ].join('\n'), 1, '在表格内部横向滚动到 column11，页面本身不横向撑宽。'),
  fixture('表格', 'long-cell', '超长单元格', '| Key | Value |\n| --- | --- |\n| sample | ' + 'LongCell'.repeat(60) + ' |', 1, '单元格可换行或在表格内部滚动，不能裁掉内容。'),
  fixture('表格', 'table-tail', '表格后普通正文', '| A | B |\n| - | - |\n| one | two |\n\n表格后第一段\n\n表格后第二段', 3, '一个表格泡及两个普通正文泡。'),
  fixture('空白气泡', 'breaks', '分割线变体', '---\n\n----\n\n* * *\n\n- - -\n\n___\n***', 5, '显示六条轻量分割线（五段），分割线不套普通气泡。'),
  fixture('空白气泡', 'setext', 'Setext 标题', 'Title\n---', 1, 'H2 标题保留，不能误当作隐藏横线。'),
  fixture('空白气泡', 'definition', '只有 reference definition', '[doc]: https://example.org/guide', 1, '整条消息只有定义时，以安全链接兜底；复制仍为原文。'),
  fixture('空白气泡', 'mixed', '正文与分割线混合', '第一段\n\n----\n\n[doc]: https://example.org\n\n第二段', 3, '两段正文和一条轻量分割线；定义不重复显示。'),
  fixture('空白气泡', 'filtered', '控制过滤后的隐藏节点', '[HEART:SYNTHETIC]\n\n----\n\n[TODO:SYNTHETIC]\n\n[doc]: https://example.org', 1, '先过滤控制标记，仅显示分割线；定义不重复显示，隐藏内容不恢复。'),
  fixture('空白气泡', 'empty-code', '合法空代码块', '```\n```', 1, '保留带工具栏的空代码块。'),
  fixture('空白气泡', 'tasks', '任务列表', '- [x] done\n- [ ] pending', 1, '保留只读 checkbox。'),
  fixture('空白气泡', 'image', '图片反例', '![合成示意图](https://example.invalid/penumbra-synthetic.png)', 1, '保留真实 MediaImage；保留域名 example.invalid 的合成引用；失败 / 重试界面也是可见输出。'),
  fixture('PR2 展示', 'standalone-code', '独立代码气泡', '```ts\n// 合成配置，不读取真实数据\nconst preview = {\n  title: "Penumbra",\n  readable: true,\n};\n\nconsole.log(preview);\n```', 1, '只有一层雾蓝代码表面；保留语言、复制和高亮。'),
  fixture('PR2 展示', 'mixed-code', '正文 + 嵌入代码 + 正文', '下面是合成配置：\n```ts\nconst theme = "mist";\n\nconsole.log(theme);\n```\n配置已就绪。', 1, '同一 Markdown 段里，代码使用轻量嵌入样式，不强拆结构。'),
  fixture('PR2 展示', 'rules-with-body', '正文之间的轻量分割线', '第一段合成正文。\n\n---\n\n第二段合成正文。', 3, '两颗普通气泡之间是一条线，不是空卡片。'),
  fixture('PR2 展示', 'definitions-only', '多个链接定义', '[guide]: https://example.org/guide\n\n[docs]: https://example.org/docs', 1, '一处链接兜底，点击安全 URL；复制保留两条定义原文。'),
  fixture('PR2 展示', 'definition-unsafe', '不安全定义链接', '[unsafe]: javascript:alert(1)', 1, '只显示链接不可用，不生成危险 href。'),
  fixture('PR2 展示', 'definition-with-body', '正文中的定义继续隐藏', '这里是正常正文。\n\n[doc]: https://example.org/guide', 1, '只显示正常正文，不额外重复 URL。'),
  fixture('PR2 展示', 'empty-shell', '无可见内容兜底', '#', 0, '显示简短的暂无可显示内容提示，不创建空白正文气泡。'),
  fixture('后续待修', 'reference-link', 'MD-03：跨泡引用链接', 'Read [guide][doc].\n\n[doc]: https://example.org/guide', 1, '无定义空泡，但 guide 暂时仍不能成为链接。', '已知限制 MD-03：跨泡 definition 上下文尚未共享。'),
  fixture('后续待修', 'reference-image', 'MD-03：跨泡引用图片', '![合成图片][pic]\n\n[pic]: https://example.org/synthetic.png', 1, '无定义空泡，但引用式图片仍显示字面文本。', '已知限制 MD-03：不是图片资源策略变化。'),
  fixture('后续待修', 'stream-scroll', 'MD-06：流式代码滚动', '```text\n' + 'SyntheticLongCode'.repeat(40) + '\n\n' + Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n') + '\n```', 1, '模拟流式时先暂停，横向滚动代码，再继续，观察滚动归零。', '已知限制 MD-06：自定义组件重挂载仍可能重置代码滚动位置。'),
];
