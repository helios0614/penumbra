import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MCPError } from "@/domain/mcp/mcp-client";
export function MCPFailure({ error, retry }: { error: MCPError | null; retry?: () => void }) {
  return error && <div role="alert" className="rounded-xl bg-warning/10 p-3 text-xs leading-relaxed"><p>{error.message}{error.status > 0 && `（HTTP ${error.status}）`}</p>{retry && <Button variant="outline" size="sm" onClick={retry}>重新读取</Button>}</div>;
}
export function MCPDialog({ title, description, children, footer, close, busy = false }: {
  title: string; description: string; children: ReactNode; footer?: ReactNode; close: () => void; busy?: boolean;
}) {
  return <Dialog open onOpenChange={(open, event) => { if (!open && busy) event.cancel(); else if (!open) close(); }}>
    <DialogContent className="sm:max-w-lg" closeButtonProps={{ disabled: busy }}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <DialogBody className="space-y-4">{children}</DialogBody>
      <DialogFooter>{footer ?? <Button variant="outline" onClick={close}>关闭</Button>}</DialogFooter>
    </DialogContent>
  </Dialog>;
}
