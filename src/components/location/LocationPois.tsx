import { useState } from "react";
import { ChevronRight, Search, Star, Store } from "lucide-react";
import type { LocationController } from "@/application/location/location-controller";
import type { LocationState } from "@/application/location/location-state";
import type { LocationPoi } from "@/domain/location";
import { AppSelect } from "@/components/ui/app-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { locationDistance } from "./location-presentation";

export function LocationPois({ state, controller, onDetail }: { readonly state: LocationState; readonly controller: LocationController | null; readonly onDetail: (poi: LocationPoi) => void }) {
  const [category, setCategory] = useState("餐饮美食"), [query, setQuery] = useState(""), [shown, setShown] = useState<string | null>(null);
  const categories = [...new Set([...(state.config?.categories ?? []), ...Object.keys(state.status?.pois ?? {})])];
  const selected = categories.includes(category) ? category : categories[0] ?? "餐饮美食";
  const displayCategory = shown ?? selected;
  const items = state.status?.pois[displayCategory] ?? [];
  const busy = Boolean(state.pending), searching = state.pending === "search";
  const blocked = !state.config?.credential.configured || !state.status?.coordinate || Boolean(state.configError);
  const fallback = state.searchResult?.category === displayCategory && state.searchResult.fallbackUsed ? state.searchResult.resolvedQuery : null;
  return <section className="mist-glass-strong rounded-[24px] px-4 py-4 sm:px-6" aria-labelledby="location-pois-title" aria-busy={searching}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="location-pois-title" className="flex items-center gap-2 text-base font-semibold"><Store className="size-4 text-primary" aria-hidden="true" />附近 POI</h2>
      {categories.length > 0 && <div className="w-full min-[360px]:w-44"><AppSelect value={selected} ariaLabel="POI 分类" surface="translucent" disabled={busy}
        options={categories.map((value) => ({ value, label: value }))} onValueChange={(value) => { setCategory(value); setShown(value); setQuery(""); }} /></div>}
    </div>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">基于后端最近坐标查询，最多十条；搜索不会让手机重新定位。</p>
    <form className="mt-3 flex min-w-0 gap-2" onSubmit={(event) => { event.preventDefault(); const term = query.trim() || selected; setShown(term); void controller?.search(term); }}>
      <Input surface="translucent" className="h-11 min-w-0 flex-1 rounded-xl text-sm" aria-label="POI 搜索关键词" placeholder={`搜索${selected}，或输入关键词`} value={query} disabled={busy} onChange={(event) => setQuery(event.target.value)} />
      <Button type="submit" variant="outline" className="h-11 gap-1.5 rounded-xl px-3" disabled={busy || blocked || query.includes("|")}><Search aria-hidden="true" />{searching ? "查询中" : "查询"}</Button>
    </form>
    {blocked && <p className="mt-2 text-xs leading-5 text-muted-foreground">主动查询需要已配置的高德 Key 和有效的最近上报坐标；已有缓存仍可查看。</p>}
    {query.includes("|") && <p className="mt-1 text-xs text-destructive">关键词请勿包含竖线；查询半径请在高级配置中设置。</p>}
    {state.searchError && <p role="alert" className="mt-2 text-xs leading-5 text-destructive">查询未完成。{state.searchError}</p>}
    <div className="mt-3 flex items-center justify-between border-b border-primary/10 pb-2 text-xs text-muted-strong"><span className="min-w-0 flex-1 break-words">{displayCategory}{fallback && ` · 使用「${fallback}」继续查询`}</span><span className="ml-2 shrink-0">{items.length} 条</span></div>
    {searching && <p role="status" className="py-3 text-xs text-muted-foreground">正在查询，暂时保留已有列表…</p>}
    {items.length ? <ul className="divide-y divide-primary/10">{items.map((poi, index) => <li key={`${poi.name}-${index}`}>
      <Button type="button" variant="ghost" className="h-auto min-h-16 w-full justify-start gap-3 whitespace-normal rounded-none px-0 py-3 text-left hover:bg-background/20" onClick={() => onDetail(poi)} aria-label={`查看${poi.name}详情`}>
        {poi.photo && <img src={poi.photo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} className="size-12 shrink-0 rounded-xl object-cover sm:size-14" />}
        <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium leading-6">{poi.name}</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-normal leading-5 text-muted-strong">
            {poi.rating && <span className="inline-flex items-center gap-1"><Star className="size-3 text-primary" aria-hidden="true" />{poi.rating}</span>}
            {poi.category && <span className="line-clamp-1 min-w-0 max-w-full">{poi.category}</span>}{poi.distance !== null && <span>{locationDistance(poi.distance)}</span>}
          </span>{poi.address && <span className="mt-0.5 block break-words text-xs font-normal leading-5 text-muted-foreground">{poi.address}</span>}
        </span><ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Button>
    </li>)}</ul> : <p role="status" className="py-5 text-sm leading-6 text-muted-foreground">{state.statusLoading && !state.status ? "正在读取地点缓存…" : "暂无可展示结果。可能尚未查询、未命中，或服务未返回地点；可稍后手动重试。"}</p>}
  </section>;
}
