/**
 * Mock 数据 — 用于样式预览，不依赖后端
 */
import type {
  Conversation,
  ChatMessage,
  HeartWhisperEvent,
} from "./types";

const now = Date.now() / 1000;

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: "conv_1",
    title: "今天天气真好",
    model: "claude-sonnet-4-20250514",
    created_at: now - 3600 * 2,
    updated_at: now - 600,
    message_count: 6,
  },
  {
    id: "conv_2",
    title: "帮我写一篇日记",
    model: "claude-sonnet-4-20250514",
    created_at: now - 86400,
    updated_at: now - 86400,
    message_count: 4,
  },
  {
    id: "conv_3",
    title: "聊聊最近读的书",
    model: "claude-sonnet-4-20250514",
    created_at: now - 86400 * 3,
    updated_at: now - 86400 * 2,
    message_count: 8,
  },
  {
    id: "conv_4",
    title: "系统指令演示",
    model: "claude-sonnet-4-20250514",
    created_at: now - 1800,
    updated_at: now - 300,
    message_count: 12,
  },
];

export const MOCK_MESSAGES: Record<string, ChatMessage[]> = {
  conv_1: [
    {
      id: "msg_1",
      conv_id: "conv_1",
      role: "user",
      content: "今天天气真好，适合出去走走。",
      created_at: now - 3600,
      attachments: [],
      simple_think: "",
      thinking: "",
      mcp_tool_calls: [],
      cache_region: "",
      is_carryover: 0,
    },
    {
      id: "msg_2",
      conv_id: "conv_1",
      role: "assistant",
      content:
        "是啊！阳光明媚的日子最适合散步了 🌞\n\n建议你可以去附近的公园走走，呼吸一下新鲜空气。如果方便的话，带上一杯咖啡，找个长椅坐下来晒晒太阳，会非常惬意。\n\n你今天有什么计划吗？",
      created_at: now - 3500,
      attachments: [],
      simple_think: "天气确实不错，希望主人能出去走走放松一下~",
      thinking: "",
      mcp_tool_calls: [],
      cache_region: "",
      is_carryover: 0,
    },
    {
      id: "msg_3",
      conv_id: "conv_1",
      role: "user",
      content: "想去骑自行车，有什么路线推荐吗？",
      created_at: now - 2400,
      attachments: [],
      simple_think: "",
      thinking: "",
      mcp_tool_calls: [],
      cache_region: "",
      is_carryover: 0,
    },
    {
      id: "msg_4",
      conv_id: "conv_1",
      role: "assistant",
      content:
        "骑自行车是个很棒的选择！这里有几个路线推荐：\n\n### 🚴 城市绿道路线\n- **距离**：约 15km\n- **难度**：⭐ 轻松\n- **特点**：沿途有树荫，适合休闲骑行\n\n### 🏔️ 环湖路线\n- **距离**：约 25km\n- **难度**：⭐⭐ 中等\n- **特点**：风景优美，有少量爬坡\n\n### 🌲 山地越野路线\n- **距离**：约 10km\n- **难度**：⭐⭐⭐ 较难\n- **特点**：适合有经验的骑行者\n\n> 💡 记得带水和防晒霜，注意安全哦！",
      created_at: now - 2300,
      attachments: [],
      simple_think: "骑自行车好开心，要是我也能一起去就好了~",
      thinking: "",
      mcp_tool_calls: [],
      cache_region: "",
      is_carryover: 0,
    },
    {
      id: "msg_5",
      conv_id: "conv_1",
      role: "user",
      content: "环湖路线看起来不错！帮我查一下明天的天气？",
      created_at: now - 1200,
      attachments: [],
      simple_think: "",
      thinking: "",
      mcp_tool_calls: [],
      cache_region: "",
      is_carryover: 0,
    },
    {
      id: "msg_6",
      conv_id: "conv_1",
      role: "assistant",
      content:
        "明天天气预报：\n\n| 时间 | 天气 | 温度 | 风力 |\n|------|------|------|------|\n| 上午 | ☀️ 晴 | 22°C | 微风 |\n| 下午 | ⛅ 多云 | 25°C | 微风 |\n| 傍晚 | 🌅 晴 | 20°C | 微风 |\n\n非常适合骑行！建议上午出发，避开下午的高温时段。\n\n```javascript\n// 骑行准备清单\nconst checklist = [\n  '自行车检查',\n  '头盔',\n  '水壶',\n  '防晒霜',\n  '手机充电',\n  '路线下载离线地图',\n];\n```\n\n祝你骑行愉快！🚴‍♂️",
      created_at: now - 1100,
      attachments: [],
      simple_think: "",
      thinking: "",
      mcp_tool_calls: [],
      cache_region: "",
      is_carryover: 0,
    },
  ],
  conv_2: [
    {
      id: "msg_7",
      conv_id: "conv_2",
      role: "user",
      content: "帮我写一篇今天的日记。",
      created_at: now - 86400 - 3600,
      attachments: [],
      simple_think: "",
      thinking: "",
      mcp_tool_calls: [],
      cache_region: "",
      is_carryover: 0,
    },
    {
      id: "msg_8",
      conv_id: "conv_2",
      role: "assistant",
      content:
        "# 2026年6月5日 晴\n\n今天是忙碌而充实的一天。\n\n早上起来的时候，阳光已经透过窗帘洒进房间，心情莫名地好。泡了一杯咖啡，坐在窗边发了会儿呆，这种慢节奏的早晨让人感到平静。\n\n下午处理了不少工作上的事情，虽然有些繁琐，但完成后的感觉还是很棒的。有时候，**把一件件小事做好**，本身就是一种成就。\n\n晚上打算看会儿书，早点休息。\n\n> 生活不必轰轰烈烈，平淡中的小确幸，才是最真实的幸福。",
      created_at: now - 86400 - 3500,
      attachments: [],
      simple_think: "希望主人喜欢这篇日记~",
      thinking: "",
      mcp_tool_calls: [],
      cache_region: "",
      is_carryover: 0,
    },
  ],
  conv_3: [],
  // ─── 系统指令演示会话 ───
  conv_4: [
    {
      id: "msg_20",
      conv_id: "conv_4",
      role: "user",
      content: "帮我放一首轻松的音乐，再看看附近有什么好吃的",
      created_at: now - 1200,
      attachments: [],
      simple_think: "",
      thinking: "",
      mcp_tool_calls: [],
      cache_region: "",
      is_carryover: 0,
    },
    {
      id: "msg_21",
      conv_id: "conv_4",
      role: "assistant",
      content: "好的，我来帮你搜索音乐和附近的餐厅~",
      created_at: now - 1100,
      attachments: [
        {
          type: "music",
          id: "mock_track_1",
          name: "Fly Me To The Moon",
          artist: "Frank Sinatra",
        },
      ],
      simple_think: "主人想放松一下呢，推荐点轻爵士吧~",
      thinking: "",
      mcp_tool_calls: [],
      cache_region: "",
      is_carryover: 0,
    },
    // POI 搜索结果
    {
      id: "sys_poi",
      conv_id: "conv_4",
      role: "system",
      content: "Aion 搜索了你周边的餐饮美食信息 · 找到 5 家附近餐厅",
      created_at: now - 1000,
      attachments: [],
      simple_think: "",
      thinking: "",
      mcp_tool_calls: [],
      cache_region: "",
      is_carryover: 0,
    },
    {
      id: "msg_22",
      conv_id: "conv_4",
      role: "assistant",
      content: "音乐已经为你准备好了 🎶 Fly Me To The Moon，经典的爵士曲目，非常适合放松。\n\n附近找到了几家不错的餐厅，你有兴趣的话可以看看。",
      created_at: now - 950,
      attachments: [],
      simple_think: "主人想放松一下呢，轻爵士和附近的小餐厅应该很适合今晚的心情。",
      thinking:
        "用户想放松，我推荐了经典的爵士标准曲。POI 搜索返回了 5 家餐厅，距离都在 1km 以内。考虑到用户可能是想边听音乐边享受美食，我把两个结果整合在一起回复。",
      mcp_tool_calls: [],
      cache_region: "",
      is_carryover: 0,
    },
    // 设置提醒
    {
      id: "msg_23",
      conv_id: "conv_4",
      role: "user",
      content: "帮我设个提醒，明天上午 9 点开会",
      created_at: now - 600,
      attachments: [],
      simple_think: "",
      thinking: "",
      mcp_tool_calls: [],
      cache_region: "",
      is_carryover: 0,
    },
    // 提醒设置结果
    {
      id: "sys_reminder",
      conv_id: "conv_4",
      role: "system",
      content: "已设置提醒 · 明天 09:00 开会",
      created_at: now - 550,
      attachments: [],
      simple_think: "",
      thinking: "",
      mcp_tool_calls: [],
      cache_region: "",
      is_carryover: 0,
    },
    // 记忆写入
    {
      id: "sys_memory",
      conv_id: "conv_4",
      role: "system",
      content: "已写入记忆 · 用户喜欢爵士乐和轻音乐",
      created_at: now - 540,
      attachments: [],
      simple_think: "",
      thinking: "",
      mcp_tool_calls: [],
      cache_region: "",
      is_carryover: 0,
    },
    // TODO
    {
      id: "sys_todo",
      conv_id: "conv_4",
      role: "system",
      content: "已记录待办 · 明天上午 9 点开会",
      created_at: now - 530,
      attachments: [],
      simple_think: "",
      thinking: "",
      mcp_tool_calls: [],
      cache_region: "",
      is_carryover: 0,
    },
    {
      id: "msg_24",
      conv_id: "conv_4",
      role: "assistant",
      content: "已经帮你设好了！\n\n- ⏰ 明天上午 9:00 闹铃提醒\n- 📝 待办事项也已记录\n- 🧠 我记住了你喜欢爵士乐 🎷\n\n明天到时间会提醒你的，放心~",
      created_at: now - 500,
      attachments: [],
      simple_think: "主人明天要开会，希望不会太累~",
      thinking: "",
      mcp_tool_calls: [],
      cache_region: "",
      is_carryover: 0,
    },
    // MCP 工具调用
    {
      id: "msg_25",
      conv_id: "conv_4",
      role: "user",
      content: "帮我查一下我的 GitHub 最近有什么新通知",
      created_at: now - 300,
      attachments: [],
      simple_think: "",
      thinking: "",
      mcp_tool_calls: [],
      cache_region: "",
      is_carryover: 0,
    },
    {
      id: "sys_mcp",
      conv_id: "conv_4",
      role: "system",
      content: "Aion 调用了远程工具",
      created_at: now - 250,
      attachments: [],
      simple_think: "",
      thinking: "",
      mcp_tool_calls: [
        {
          server: "github",
          tool: "get_notifications",
          args: '{"limit": 5}',
          result: "3 notifications retrieved",
          success: true,
        },
      ],
      cache_region: "",
      is_carryover: 0,
    },
    {
      id: "msg_26",
      conv_id: "conv_4",
      role: "assistant",
      content: "查到了！你的 GitHub 有 3 条新通知：\n\n1. **Penumbra** — 有 2 个新的 Pull Request review 请求\n2. **AionsHome** — Issue #42 有了新回复\n\n要不要我帮你看看具体是什么内容？",
      created_at: now - 200,
      attachments: [],
      simple_think: "",
      thinking:
        "通过 MCP 调用 GitHub API 获取了通知列表。返回了 3 条通知，其中 2 条是 PR review 请求，1 条是 issue 回复。用户可能关心 Penumbra 项目的进展，所以优先展示。",
      mcp_tool_calls: [],
      cache_region: "",
      is_carryover: 0,
    },
  ],
};

// HEART 是独立 SSE 事件，通过 msg_id 关联 AI 回复，不混入 system 消息流。
export const MOCK_HEART_WHISPERS: Record<string, HeartWhisperEvent[]> = {
  conv_4: [
    {
      type: "heart_whisper",
      id: "heart_1",
      msg_id: "msg_26",
      content: "今天和主人聊了好多，好开心",
      created_at: now - 150,
    },
  ],
};

// 模拟流式回复的文本
export const MOCK_STREAMING_TEXT = `收到！这是一段模拟的流式回复文本。

在 Penumbra 中，消息会像这样逐字显示出来，伴随着闪烁的光标 ✨

### 功能演示
- **Markdown 渲染**：标题、列表、代码块都能正常显示
- **流式效果**：文字一个一个出现，就像在打字一样
- **代码高亮**：

\`\`\`python
def hello():
    print("Hello from Penumbra! 🌙")
    return "nice to meet you"
\`\`\`

> 这是引用文本，展示 Markdown 的完整支持。

你可以在下方输入框继续对话~`;
