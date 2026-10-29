import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryEditDialog, memoryKeywordDraft } from "./MemoryEditDialog";
import { MemoryConfirmDialog } from "./MemoryConfirmDialog";
import { MemoryActions } from "./MemoryActions";
import { MemoryItem, MemoryPinAction } from "./MemoryItem";
import { MemoryManagementFeedback } from "./MemoryManagementFeedback";
import { INITIAL_MEMORY_MANAGEMENT_STATE, type MemorySourceRead } from "@/application/memory-management";
import type { Memory } from "@/domain/memory";
import { Dialog, DialogBody } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialogAction } from "@/components/ui/alert-dialog";
import { Popover } from "@/components/ui/popover";
import { hookSession, elements, find } from "@/components/chat/test-utils/hook-session";
vi.mock("react", async original => { const actual = await original<typeof React>(); return { ...actual, ...Object.fromEntries(["useState", "useRef", "useCallback", "useId", "useEffect", "useLayoutEffect"].map(key=>[key,vi.fn(actual[key as keyof typeof actual] as never)])) }; });
afterEach(()=>vi.restoreAllMocks());
const memory: Memory = { id:"m",content:" \n原始正文\n ",type:"digest",createdAt:1,importance:0.456,tags:["read tag"],keywordsForEdit:JSON.stringify(Array.from({length:40},(_,i)=>`tag-${i}`)),isPinned:false,sourceConversationId:null,sourceStartedAt:1,sourceEndedAt:10 };
const focus = { current: null };
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function editor() {
  let pending=false;
  const submit=vi.fn(async()=>false),close=vi.fn();
  const h=hookSession(()=>MemoryEditDialog({memory,pending,error:null,onSubmit:submit,onClose:close,finalFocus:focus}));
  const form=()=>find(h.render(),DialogBody).props.render as React.ReactElement<React.ComponentProps<"form">>;
  return {...h,submit,close,save:()=>form().props.onSubmit?.({preventDefault:vi.fn()} as never),pending:()=>{pending=true;}};
}
describe("memory management presentation",()=>{
  it.each([undefined, {status:"ready",value:{supported:true,sourceCount:10}}, {status:"error",error:{code:"unknown",message:"failed",uncertain:true}}] as const)("hides source actions for the stored 知远总结 type regardless of cached preflight: %j", source => {
    const special = {...memory,type:"知远总结",content:"正文不参与类型判断"}; const check=vi.fn(),action=vi.fn();
    const h=hookSession(()=>MemoryActions({memory:special,pending:false,source,onCheckSource:check,onAction:action}));
    find(h.render(),Popover).props.onOpenChange?.(true,{} as never);
    expect(check).not.toHaveBeenCalled(); const items=elements(h.render()).filter(e=>e.props.role==="menuitem");
    expect(items).toHaveLength(2); expect(JSON.stringify(h.render())).not.toContain("重新总结"); expect(JSON.stringify(h.render())).not.toContain("重新检查来源");
    (items[0].props.onClick as ()=>void)(); expect(action).toHaveBeenLastCalledWith({kind:"edit",memory:special});
    (items[1].props.onClick as ()=>void)(); expect(action).toHaveBeenLastCalledWith({kind:"delete",memory:special});
    h.dispose();
  });
  it("hides only the source icon and keeps Pin for 知远总结, including inconsistent legacy metadata", () => {
    const pin=vi.fn(),view=vi.fn(); const h=hookSession(()=>MemoryItem({memory:{...memory,type:"知远总结"},pending:false,onSetUnresolved:pin,onViewSource:view,onAction:vi.fn(),onCheckSource:vi.fn()}));
    expect(elements(h.render()).filter(e=>e.props["aria-label"]==="查看原文")).toHaveLength(0);
    const pinProps=find(h.render(),MemoryPinAction).props;
    find(MemoryPinAction(pinProps),"button").props.onClick?.({} as never); expect(pin).toHaveBeenCalledWith("m",true); expect(view).not.toHaveBeenCalled();
    expect(find(h.render(),"div",p=>p["data-memory-item-header" as keyof typeof p]==="true").props.className).toContain("pr-24"); h.dispose();
  });
  it.each(["digest","event","future-type",null])("preserves other types' source entry and four actions even when prose says 知远总结: %s", type => {
    const other={...memory,type,content:"知远总结"}; const check=vi.fn();
    const h=hookSession(()=>MemoryActions({memory:other,pending:false,source:{status:"ready",value:{supported:false,reason:"source_untracked"}},onCheckSource:check,onAction:vi.fn()}));
    find(h.render(),Popover).props.onOpenChange?.(true,{} as never); expect(check).toHaveBeenCalledWith("m");
    const items=elements(h.render()).filter(e=>e.props.role==="menuitem"); expect(items).toHaveLength(4); expect(items[3].props.disabled).toBe(true); h.dispose();
    const item=hookSession(()=>MemoryItem({memory:other,pending:false,onSetUnresolved:vi.fn(),onViewSource:vi.fn()}));
    expect(find(item.render(),"button",p=>p["aria-label"]==="查看原文").props.title).toBe("查看原文"); item.dispose();
  });
  it.each(["AI总结","澄明总结","历史名字总结","Aion 总结","总结"])("uses the backend name-derived type format without hardcoding a current AI name: %s", type => {
    const named={...memory,type,content:"与名字无关的正文"};const check=vi.fn();
    const h=hookSession(()=>MemoryActions({memory:named,pending:false,source:{status:"ready",value:{supported:true,sourceCount:10}},onCheckSource:check,onAction:vi.fn()}));
    find(h.render(),Popover).props.onOpenChange?.(true,{} as never);expect(check).not.toHaveBeenCalled();expect(elements(h.render()).filter(e=>e.props.role==="menuitem")).toHaveLength(2);h.dispose();
    const item=hookSession(()=>MemoryItem({memory:named,pending:false,onSetUnresolved:vi.fn(),onViewSource:vi.fn()}));
    expect(elements(item.render()).filter(e=>e.props["aria-label"]==="查看原文")).toHaveLength(0);expect(find(item.render(),MemoryPinAction).props.memoryId).toBe("m");item.dispose();
  });
  it("fills full keywords and exact importance, and preserves untouched fields on failed saves",async()=>{
    const s=editor();
    expect(find(s.render(),Textarea).props.value).toBe(memory.content);
    expect(find(s.render(),Input,p=>p.type==="number").props.value).toBe("0.456");
    expect(find(s.render(),Input,p=>p.type!=="number").props.value).toContain("tag-39");
    find(s.render(),Textarea).props.onChange?.({target:{value:"unsaved draft"}} as never); s.save(); await tick();
    expect(s.submit).toHaveBeenCalledWith({content:"unsaved draft"});
    expect(find(s.render(),Textarea).props.value).toBe("unsaved draft"); expect(s.close).not.toHaveBeenCalled();
    find(s.render(),Button,p=>p.children==="取消").props.onClick?.({} as never);expect(s.close).toHaveBeenCalledOnce();
  });
  it("serializes changed keyword/importance fields, blocks duplicate submit and pending close",async()=>{
    const s=editor();let finish!:(value:boolean)=>void;s.submit.mockImplementation(()=>new Promise(r=>{finish=r;}));
    find(s.render(),Input,p=>p.type!=="number").props.onChange?.({target:{value:"海边，海边, 电影"}} as never);
    find(s.render(),Input,p=>p.type==="number").props.onChange?.({target:{value:"0"}} as never);
    s.save();s.save();expect(s.submit).toHaveBeenCalledOnce();expect(s.submit).toHaveBeenCalledWith({content:memory.content,keywords:'["海边","电影"]',importance:0});
    s.pending();const cancel=vi.fn();find(s.render(),Dialog).props.onOpenChange?.(false,{cancel} as never);expect(cancel).toHaveBeenCalledOnce();
    finish(false);await tick();
  });
  it("preserves unknown keyword wire formats until explicitly edited",()=>{
    expect(memoryKeywordDraft({...memory,keywordsForEdit:"legacy plain text"})).toBe("legacy plain text");
    expect(memoryKeywordDraft({...memory,keywordsForEdit:'["a",3]'})).toBe('["a",3]');
  });
  it("only enables the combined confirmation after a positive source read",()=>{
    for(const source of [undefined,{status:"loading"} as const,{status:"ready",value:{supported:false,reason:"source_untracked"}} as const]) {
      const node=MemoryConfirmDialog({action:{kind:"requeue",memory},pending:false,error:null,source,onSubmit:vi.fn(),onClose:vi.fn(),onCheckSource:vi.fn(),finalFocus:focus});
      expect(find(node,AlertDialogAction).props.disabled).toBe(true);
    }
    const node=MemoryConfirmDialog({action:{kind:"requeue",memory},pending:false,error:null,source:{status:"ready",value:{supported:true,sourceCount:10}},onSubmit:vi.fn(),onClose:vi.fn(),onCheckSource:vi.fn(),finalFocus:focus});
    expect(find(node,AlertDialogAction).props.disabled).toBe(false);
    expect(JSON.stringify(node)).toContain("原始聊天消息不会删除");
  });
  it("checks sources on menu open and exposes four keyboard-accessible textual actions",()=>{
    let source:MemorySourceRead|undefined;
    const check=vi.fn(),action=vi.fn();const h=hookSession(()=>MemoryActions({memory,pending:false,source,onCheckSource:check,onAction:action}));
    find(h.render(),Popover).props.onOpenChange?.(true,{} as never);expect(check).toHaveBeenCalledWith("m");
    const items=()=>elements(h.render()).filter(e=>e.props.role==="menuitem");expect(items()).toHaveLength(4);expect(items()[3].props.disabled).toBe(true);
    source={status:"ready",value:{supported:false,reason:"source_untracked"}};expect(JSON.stringify(h.render())).toContain("没有精确来源");
    source={status:"ready",value:{supported:true,sourceCount:10}};expect(items()[3].props.disabled).toBe(false);
    (items()[3].props.onClick as ()=>void)();expect(action).toHaveBeenCalledWith({kind:"requeue",memory});
  });
  it("distinguishes no new output, queued, failed-pending and completed without saying pending is running",()=>{
    const state={...INITIAL_MEMORY_MANAGEMENT_STATE,digestResult:{ok:true,message:"当前没有新增内容需要总结",newMemoriesCount:0,processedMessages:0},tasks:[{task:{id:"t",state:"pending" as const,deletedMemoryId:"m",resultMemoryId:null,sourceCount:10,lastError:null,deduplicated:false},reading:false,error:null}]};
    let html=renderToStaticMarkup(<MemoryManagementFeedback state={state} onRefreshTask={vi.fn()}/>);
    expect(html).toContain("新增 0 条记忆");expect(html).toContain("来源已加入待总结队列");expect(html).not.toContain("正在执行");
    html=renderToStaticMarkup(<MemoryManagementFeedback state={{...state,tasks:[{...state.tasks[0],task:{...state.tasks[0].task,lastError:"embedding_failure"}}]}} onRefreshTask={vi.fn()}/>);expect(html).toContain("来源总结失败");
    html=renderToStaticMarkup(<MemoryManagementFeedback state={{...state,tasks:[{...state.tasks[0],task:{...state.tasks[0].task,state:"completed",resultMemoryId:"new"}}]}} onRefreshTask={vi.fn()}/>);expect(html).toContain("来源总结已完成");expect(html).not.toContain("查询状态");
  });
});
