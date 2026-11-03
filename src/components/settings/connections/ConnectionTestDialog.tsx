import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getConnection } from "@/domain/registry/registry-client";
import type { Connection } from "@/domain/registry/registry-types";
import { ConnectionError } from "./ConnectionShared";
import { ConnectionProbe } from "./ConnectionProbe";
import { useRegistryTask } from "./useRegistryTask";

export function ConnectionTestDialog({ id, onClose, finalFocus }: { id: string; onClose: () => void; finalFocus: () => HTMLElement | null }) {
  const read = useRegistryTask<Connection>();
  const refresh = () => { void read.run(signal => getConnection(id, { signal })); };
  useEffect(refresh, [id]);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent finalFocus={finalFocus} closeButtonProps={{ "aria-label": "关闭连接测试" }}>
      <DialogHeader><DialogTitle>测试连接</DialogTitle><DialogDescription>{read.state.data?.name ?? "读取已保存连接"}</DialogDescription></DialogHeader>
      {read.state.data ? <ConnectionProbe key={id} connection={read.state.data} onClose={onClose} /> : <><DialogBody>
        {read.state.status === "loading" && <p role="status">正在读取连接…</p>}
        <ConnectionError error={read.state.error} onRetry={refresh} />
      </DialogBody>
      <DialogFooter><Button variant="outline" onClick={onClose}>关闭</Button></DialogFooter></>}
    </DialogContent>
  </Dialog>;
}
