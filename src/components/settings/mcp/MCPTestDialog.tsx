import { useEffect } from "react";
import { testServer } from "@/domain/mcp/mcp-client";
import { useMCPTask } from "./useMCPTask";
import { MCPDialog, MCPFailure } from "./MCPShared";
export interface TestInput { id: string; body: Record<string, unknown> }
export function MCPTestDialog({ input, close, stale }: { input: TestInput; close: () => void; stale: () => void }) {
  const task = useMCPTask<Awaited<ReturnType<typeof testServer>>>();
  useEffect(() => { void task.run(signal => testServer(input.id, input.body, signal)); }, []);
  useEffect(() => { if (task.state.error?.code === "stale_secret_ref") stale(); }, [task.state.error]);
  return <MCPDialog title="连接测试结果" description="仅本次测试，不保存草稿、不启用服务器，也不修改最近验证记录。" close={close}>
    {task.state.busy && <p role="status" className="text-sm">正在测试连接…</p>}
    <MCPFailure error={task.state.error} />
    {task.state.data && <div role="status" className="space-y-2 text-sm">
      <p className={task.state.data.success ? "text-success" : "text-destructive"}>{task.state.data.success ? "测试成功" : "测试失败"}</p>
      <p>返回工具：{task.state.data.count} 项</p>{task.state.data.error && <p>{task.state.data.error}</p>}
    </div>}
  </MCPDialog>;
}
