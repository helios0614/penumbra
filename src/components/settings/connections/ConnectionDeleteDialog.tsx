import { useEffect, useRef } from "react";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteConnection, getConnectionReferences } from "@/domain/registry/registry-client";
import { canDeleteConnection, RegistryError, type Connection, type ConnectionReferences } from "@/domain/registry/registry-types";
import { ConnectionError } from "./ConnectionShared";
import { ConnectionReferenceFacts } from "./ConnectionReferences";
import { useRegistryTask } from "./useRegistryTask";

export function ConnectionDeleteDialog({ connection, onClose, onDeleted, finalFocus }: {
  connection: Connection; onClose: () => void; onDeleted: () => void; finalFocus: () => HTMLElement | null;
}) {
  const refs = useRegistryTask<ConnectionReferences>(), write = useRegistryTask<boolean>();
  const lock = useRef(false);
  const refresh = () => { void refs.run(signal => getConnectionReferences(connection.id, { signal })); };
  useEffect(refresh, [connection.id]);
  const remove = async () => {
    if (lock.current || !canDeleteConnection(refs.state.data) || write.state.status !== "idle") return;
    lock.current = true;
    try {
      const result = await write.run(async signal => {
        const latest = await getConnectionReferences(connection.id, { signal });
        if (!canDeleteConnection(latest)) throw new RegistryError(latest.unresolved.length ? "unresolved_selection_references" : "connection_in_use");
        if (signal.aborted) throw new RegistryError("unknown");
        return deleteConnection(connection.id, { signal });
      });
      if (result) onDeleted();
      else refresh();
    } finally { lock.current = false; }
  };
  return <AlertDialog open onOpenChange={open => { if (!open) onClose(); }}>
    <AlertDialogContent finalFocus={finalFocus}>
      <AlertDialogHeader>
        <AlertDialogTitle>删除连接</AlertDialogTitle>
        <AlertDialogDescription>确认删除「{connection.name}」？不级联删除，不自动切换连接。</AlertDialogDescription>
        <div className="mt-3 space-y-3">
          {refs.state.status === "loading" && <p role="status" className="text-xs">正在核对引用…</p>}
          <ConnectionError error={refs.state.error} onRetry={refresh} />
          {refs.state.data && <ConnectionReferenceFacts value={refs.state.data} />}
          {refs.state.data && !canDeleteConnection(refs.state.data) && <p className="text-xs text-warning">有引用或无法解析的引用，不能删除。</p>}
          <ConnectionError error={write.state.error} />
          {write.state.error && <p className="text-xs text-muted-strong">不会自动重发删除。请关闭并刷新列表核对结果。</p>}
        </div>
      </AlertDialogHeader>
      <AlertDialogFooter><Button variant="outline" onClick={onClose}>取消</Button>
        <Button variant="destructive" loading={write.state.status === "loading"} disabled={refs.state.status !== "success" || !canDeleteConnection(refs.state.data) || write.state.status !== "idle"}
          onClick={() => { void remove(); }}>确认删除</Button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
