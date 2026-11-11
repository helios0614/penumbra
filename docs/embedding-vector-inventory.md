# P0 · Embedding 历史向量盘点

## 1. 数据源确认

**本地与服务器已检查的范围内，未找到可确认安全且能代表历史数据的副本。本轮未打开数据库，Memory 和 Diary 的真实统计均待补。** 此次对应 PR-V1 前的数据盘点。AionHome 基线为 `dbb55e2`，Penumbra 基线为 `fb62689`。本轮仅交付本报告。 [一致性审计](/Users/remix/Desktop/Penumbra/docs/embedding-vector-integrity-audit.md)

| 候选 | 已确认事实 | 本轮处理 |
| --- | --- | --- |
| AionHome `aion-chat/data/chat.db` | 文件存在，大小 131,072 字节，Git 忽略。源码将此路径作为应用运行库。文件大小只能证明文件存在。 [数据库路径](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:28) · [运行连接](/Users/remix/Desktop/AionsHome-main/aion-chat/database.py:485) | 未确认是脱敏副本，未连接或复制。 |
| AionHome `aion-chat/data/aion.db` | 当前工作区文件与 Git HEAD 对象均为 0 字节。证据为 `stat` 与 `git cat-file -s HEAD:aion-chat/data/aion.db`。 | 是空占位文件，无法代表 Memory 或 Diary 有零条记录。 |
| 本地临时目录 | 文件名搜索发现 pytest 夹具和早期任务的临时运行库，缺少经确认的历史快照来源。 | 未打开，不将夹具计数作为存量数据。 |
| 服务器 `aion-prod` | SSH 已连通。按路径和文件名搜索了 `/srv`、`/opt`、`/var/backups`、`/tmp`、`/var/tmp`、登录用户主目录、`/mnt` 和 `/data`，各起点同一文件系统内最多四层。已扫描部分未发现带脱敏或快照标记的 SQLite 文件。部分目录遍历返回错误，结果仅覆盖当前账号可搜索的部分。 | 未提权、打开或复制任何数据库，也未创建快照。若副本使用其他名称，需提供其准确路径与来源。 |

## 2. Memory 与 Diary 统计

「待统计」表示未取得可用样本。下表按表和状态记录结果，Diary 的异常分布也按状态拆分，便于区分当前召回候选和草稿。

| 指标 | Memory 全部 | Diary 全部 | Diary done | Diary 非 done |
| --- | --- | --- | --- | --- |
| 记录总数 | 待统计 | 待统计 | 待统计 | 待统计 |
| `embedding IS NULL` | 待统计 | 待统计 | 待统计 | 待统计 |
| 非 NULL BLOB | 待统计 | 待统计 | 待统计 | 待统计 |
| 非 NULL 但 SQLite 类型不是 BLOB | 待统计 | 待统计 | 待统计 | 待统计 |
| BLOB 字节长度分布 | 待统计 | 待统计 | 待统计 | 待统计 |
| 按字节长度推算的维度分布 | 待统计 | 待统计 | 待统计 | 待统计 |
| float32 结构可解码／解码失败／空 BLOB | 待统计 | 待统计 | 待统计 | 待统计 |
| 含 NaN／含 Infinity／含任一非有限值 | 待统计 | 待统计 | 待统计 | 待统计 |
| 有限、非空但零范数 | 待统计 | 待统计 | 待统计 | 待统计 |

统计口径为行数。通过 SQLite 的 `typeof(embedding)` 区分 NULL、BLOB 和其他类型。空 BLOB 属于 BLOB，可解出零个元素，但单独计为不可用。字节数为 4 的倍数时才推算维度，包含空 BLOB 的 0 维。结构可解码和数值有效分开统计。同一行可同时含 NaN 和 Infinity，`nonfinite_rows` 按并集计一次。零范数只检查非空且全部有限的向量，正零和负零都计入。Diary 用 `CASE WHEN status='done'` 分组，NULL 或其他状态都归入非 done。附录只读取这两个表的向量列和 Diary 完成状态。 [Memory schema](/Users/remix/Desktop/AionsHome-main/aion-chat/database.py:108) · [Diary schema](/Users/remix/Desktop/AionsHome-main/aion-chat/database.py:353) · [现行编解码](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:110)

## 3. 来源与兼容性

| 分类 | 结论 | 依据 |
| --- | --- | --- |
| 已确认 | Memory 和 Diary 的 `embedding` 是可空 BLOB。现行写法是原生字节序 float32，无向量头、模型、空间 ID、生成端点或输入版本。Diary 的 `model` 用于日记生成模型选择。 | [Memory 打包](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:110) · [Diary 写入](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:576) · [日记模型选择](/Users/remix/Desktop/AionsHome-main/aion-chat/diary_model_selection.py:7) |
| 已确认 | 当前分支历史有 Gemini 3072 维约定与 SiliconFlow 默认 BGE 1024 维约定，也曾修改默认别名、输入预处理和模型可写规则。C1 复制旧有效 URL/Key 并保留原模型设置，迁移对象是配置。 | Git `3ed6e13:aion-chat/memory.py:15`、`a55626d:aion-chat/memory.py:36`、`31134da:aion-chat/config.py`、`83ca828:aion-chat/memory.py`；[C1 迁移](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:150) |
| 推断 | 如果历史部署经历这些变化，或端点曾变更，可能存有多个维度或同维不同空间。当前余弦用 `zip` 截断点积，形状不兼容可静默算分。对齐的随机字节也可以解为 float32；格式通过无法验证生成来源。 | [余弦函数](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:119) · [请求配置](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:128) |
| 推断 | 日记即使维度和数值正常，也可能对应旧标题或旧正文。只读统计不读取正文，无法检测这类错配。 | [Diary 更新](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/diary.py:553) |
| 未知 | 实际是否存在 1024 以外维度、坏 BLOB、零范数和旧输入错配，历史生产端字节序，以及是否存在可信且能关联单条向量的外部 provenance。 | 本轮缺少安全副本，当前 schema 无逐条 provenance。 |

4096 字节只能推算 1024 个 float32 槽位。当前 Settings、日期、模型别名和长度均无法给历史 BLOB 定源。只有可信记录能把**具体向量**关联到生成时的实际模型或部署版本、路由和有效输入时，才可认定其空间。无此证据的历史向量归为来源未知。选择错误字节序也可能得到形式上有限的数，不能用异常更少的结果反推字节序。 [配置 getter](/Users/remix/Desktop/AionsHome-main/aion-chat/config.py:310) · [历史审计](/Users/remix/Desktop/Penumbra/docs/embedding-vector-integrity-audit.md:71)

## 4. 是否重建及最小处理方案

**当前无法判断重建范围或成本。** 如果没有历史向量，现有 BLOB 无需重建。若存在来源未知的历史向量，原始字节应保留。需要在已确认的活跃空间继续对这些正文做语义召回时，只为需要语义召回的 Memory 和已完成 Diary 重新计算向量。可接受文本或元数据退化时，可以暂缓重建。即使所有历史 BLOB 都是 4096 字节，这一判断也不变。 [现有 Diary 退化路径](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:671) · [背景记忆退化路径](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:511)

最小方案先保留来源未知的原始 BLOB 和业务字段，处理掉坏向量参与比较以及正文编辑后旧向量仍生效的问题。启用空间隔离时，未知向量退出向量评分，保留 Diary 最新篇、关键词与重要度、Memory 的现有非向量路径。现有普通/Core Memory 在查询向量缺失时直接返回空结果，不能描述为已具备纯关键词检索。若验收需要为这两个通道加纯文本候选，明确规则并单独回归排序。 [普通和 Core 早退](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:220) · [无向量 Core 选择](/Users/remix/Desktop/AionsHome-main/aion-chat/memory.py:323)

如统计与人工验收决定重建，优先采用维护窗口下的单进程脚本。先保留一致性备份，固定目标配置，分批处理实际需要的行。用目标空间和原条目 ID 做幂等记录，校验当时有效输入的摘要，重启跳过已经成功且内容未变的行。保存新向量时保留旧 BLOB 的备份，或者把新向量暂存在 SQLite 小旁表，验证完成后再启用。在运行窗口暂停相关写入可省掉在线并发调度，不能暂停时才增加提交前的正文比对。重建只使用已保存的 Memory 正文/摘要与 Diary 最终标题和正文，保留来源、重要度和正文。启用前确认旧配置和数据可恢复。当前仅有未知旧向量时，安全回退到文本/元数据路径。

## 5. PR-V1 至 PR-V4

| 顺序 | 最小实施与验收 |
| --- | --- |
| **PR-V1 · 共用生成与召回校验** | 一个共享编解码和校验模块供 Memory/Diary 使用。新生成向量验证响应结构、元素类型、有限性、非空、目标维度以及 float32 转换后有效性，默认 BGE 要求 1024。发现其他已保存模型时先确认实际维度合同。用等长校验代替 `zip` 的隐式截断，每行单独过滤坏数据，NaN 不进入排序。旧 BLOB 按历史编码读取并按形状诊断，保留原字节；明确现有字节序之后再决定是否切换编码。阶段内保留权重、阈值、来源过滤和事件顺序。覆盖正常、短/长、空/零、NaN/Infinity、非数值、溢出/下溢、异常长度、混合批次与 HTTP 失败。维度相同只能通过格式检查，空间隔离由 V3 完成。 |
| **PR-V2 · 正文一致性** | Diary 先合并现存行与部分更新，以最终标题 + 正文计算。变更正文且生成失败时同一次更新写正文和 NULL；只改元数据不重算。覆盖完成、重开和删除；如果在事务外等待远端，最终更新前对影响输入的旧字段做一次条件比对，避免迟到覆盖。Memory 编辑与重新总结核对正文/向量同写。批量摘要已有锚点和失败语义，如需变为保存摘要且向量缺失，单独验收锚点和补算策略。用定向测试覆盖标题、正文、失败、元数据、并发和状态变化。 [当前 Memory 编辑](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py:187) · [重新总结](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/memories.py:386) |
| **PR-V3 · 端点与空间门禁** | 后端拦截会改变有效地址的普通 Settings 写入，包括恢复默认；无变化可保存，同一路由经确认后可轮换 Key。首次配置或确实要换服务时走维护流程，先排空在途生成，避免“查无向量后切换”与旧请求落库竞态。需在同库保留未知历史又启用新向量时，优先采用一个活跃 ID 和每条向量一个可空空间标记；未知保持 NULL，比较时只选已确认的匹配空间。ID 随经确认的模型/路由变化而变更，禁止只用 URL + model 哈希。V3 与 V4 的召回切换在同一验收窗口协调，提前确认文本退化影响。覆盖变更、默认恢复、无变化、Key 轮换和旧客户端。 [地址写入与提交](/Users/remix/Desktop/AionsHome-main/aion-chat/routes/settings.py:193) |
| **PR-V4 · 存量数据** | 等盘点真实数量、长度、异常分布和可证来源后决定范围。保留原始 BLOB。只对需要回到语义召回的条目计算新向量，优先使用可中断、幂等的维护脚本。仅当规模或停机时间证明有需要时再考虑后台任务。用合成夹具验收暂停、重试、回滚和未变更业务字段。 |

## 附录 · 可执行的只读统计

仅使用人工确认的、静止且自包含的 SQLite 副本。若原库采用 WAL，应由数据所有者提供已正确纳入已提交 WAL 内容的独立快照。不要用只拷贝运行库主文件的方式代替快照。脚本要求显式传入路径和字节序，拒绝项目默认运行库目录以及同名 WAL、SHM 或 rollback journal。路径检查只是防误用，副本安全性与字节序仍需人工确认。字节序未知时可以分别运行，报告两组假设和一致的长度分布。

脚本使用 `mode=ro&immutable=1` 和连接级 `query_only`。SQL 只取存储类型、BLOB 和完成状态分类；非 BLOB 原值不会取出。BLOB 在进程内逐行解码，输出只含聚合 JSON。日记全量由 done 与非 done 合并，空表输出零值。没有导入 AionHome 模块、应用配置或凭据。

已使用模拟连接和合成字节验证脚本的聚合逻辑，覆盖 NULL、非 BLOB、空 BLOB、错误长度、1024 维、NaN 和 Infinity 并集、零范数、大小端解码与 Diary 状态汇总。SQLite 集成统计留待安全副本确认后执行。

```sh
python3 -I -B - '/绝对路径/已确认的脱敏副本.sqlite3' --byte-order little <<'PY'
import argparse
import json
import math
import sqlite3
import struct
from collections import Counter
from contextlib import closing
from pathlib import Path

METRICS = (
    "total_rows", "null_rows", "blob_rows", "non_blob_non_null_rows",
    "float32_decodable_rows", "decode_error_rows", "empty_blob_rows",
    "nan_rows", "infinity_rows", "nonfinite_rows", "zero_norm_rows",
    "finite_nonzero_rows",
)
MEMORY_SQL = """
SELECT typeof(embedding), CASE WHEN typeof(embedding) = 'blob' THEN embedding END
FROM main.memories
"""
DIARY_SQL = """
SELECT CASE WHEN status = 'done' THEN 'done' ELSE 'not_done' END,
       typeof(embedding), CASE WHEN typeof(embedding) = 'blob' THEN embedding END
FROM main.diary_entries
"""


def bucket():
    return Counter(), Counter(), Counter()


def tally(target, storage, blob, fmt):
    counts, lengths, dims = target
    counts["total_rows"] += 1
    if storage == "null":
        counts["null_rows"] += 1
        return
    if storage != "blob":
        counts["non_blob_non_null_rows"] += 1
        return

    counts["blob_rows"] += 1
    size = len(blob)
    lengths[size] += 1
    if size % 4:
        counts["decode_error_rows"] += 1
        return
    dims[size // 4] += 1

    has_nan = has_inf = has_nonzero = False
    try:
        for (value,) in struct.iter_unpack(fmt, blob):
            has_nan |= math.isnan(value)
            has_inf |= math.isinf(value)
            has_nonzero |= value != 0.0
    except struct.error:
        counts["decode_error_rows"] += 1
        return

    counts["float32_decodable_rows"] += 1
    if size == 0:
        counts["empty_blob_rows"] += 1
        return
    counts["nan_rows"] += has_nan
    counts["infinity_rows"] += has_inf
    if has_nan or has_inf:
        counts["nonfinite_rows"] += 1
    elif has_nonzero:
        counts["finite_nonzero_rows"] += 1
    else:
        counts["zero_norm_rows"] += 1


def project(target):
    counts, lengths, dims = target
    return {
        **{key: counts[key] for key in METRICS},
        "blob_bytes_histogram": dict(sorted(lengths.items())),
        "dimensions_inferred_from_length": dict(sorted(dims.items())),
    }


def main():
    parser = argparse.ArgumentParser(description="仅统计已确认的独立 SQLite 副本")
    parser.add_argument("confirmed_snapshot", type=Path)
    parser.add_argument("--byte-order", choices=("little", "big"), required=True)
    args = parser.parse_args()
    try:
        path = args.confirmed_snapshot.resolve(strict=True)
        if not path.is_file() or path.stat().st_size == 0:
            raise SystemExit("需要非空的 SQLite 副本文件。")
        if path.parent.name == "data" and path.parent.parent.name == "aion-chat":
            raise SystemExit("拒绝应用运行库目录。请提供目录外的独立副本。")
        if any(Path(str(path) + suffix).exists() for suffix in ("-wal", "-shm", "-journal")):
            raise SystemExit("发现 SQLite 边车文件。请提供自包含的静止副本。")
    except OSError:
        raise SystemExit("无法确认副本路径。") from None

    fmt = "<f" if args.byte_order == "little" else ">f"
    memory = bucket()
    diary = {"done": bucket(), "not_done": bucket()}
    try:
        with closing(sqlite3.connect(path.as_uri() + "?mode=ro&immutable=1", uri=True)) as db:
            db.execute("PRAGMA query_only=ON")
            db.execute("PRAGMA trusted_schema=OFF")
            tables = {row[0] for row in db.execute("""
                SELECT name FROM main.sqlite_master
                WHERE type = 'table' AND name IN ('memories', 'diary_entries')
            """)}
            if tables != {"memories", "diary_entries"}:
                raise SystemExit("副本缺少预期的 Memory 或 Diary 表。")
            for storage, blob in db.execute(MEMORY_SQL):
                tally(memory, storage, blob, fmt)
            for group, storage, blob in db.execute(DIARY_SQL):
                tally(diary[group], storage, blob, fmt)
    except sqlite3.Error:
        raise SystemExit("只读统计失败。请核对副本完整性与预期列。") from None

    diary_all = tuple(a + b for a, b in zip(diary["done"], diary["not_done"]))
    print(json.dumps({
        "byte_order_assumption": args.byte_order,
        "memory": project(memory),
        "diary": {
            "all": project(diary_all),
            "done": project(diary["done"]),
            "not_done": project(diary["not_done"]),
        },
    }, indent=2))


if __name__ == "__main__":
    main()
PY
```

## 6. 生产环境统计预检

**预检已停止，生产统计未执行。** 主库文件头标记为 WAL，但检查时同名 WAL 和 SHM 文件均不存在。按照本轮要求，只有现有且可读的 WAL/SHM 才能用于获取快照。预检结束后未打开 SQLite 连接，也未尝试其他数据库。

| 项目 | 观察结果 |
| --- | --- |
| 时间及 SSH | 2026-11-10 16:39（UTC+08:00），通过现有配置连接 `aion-prod`。 |
| 运行服务与路径 | `aion-chat.service` 处于 active，运行入口为 `main`。systemd 工作目录与主进程 cwd 一致。部署的 `config.py` 从模块目录计算 `data/chat.db`，`database.py` 使用该 `DB_PATH`。逻辑路径为 `<AionHome>/aion-chat/data/chat.db`。主文件所有者与运行账号一致，检查进程文件描述符时未观察到该库的打开句柄。 |
| 主库 | 存在，为可读的常规文件，4,854,722,560 字节。 |
| Journal Mode | 部署初始化代码设置 WAL。以 `O_RDONLY\|O_NOATIME` 读取 SQLite 文件头的前 20 字节，读写格式字节均为 2，确认主库文件为 WAL 格式。SQL `PRAGMA journal_mode` 未执行。 |
| 边车文件 | 同路径下的 `chat.db-wal`、`chat.db-shm` 和 `chat.db-journal` 在检查时均不存在。 |
| 一致快照及 WAL | 未建立 SQLite 连接或事务，未取得快照，也未将任何 WAL 内容纳入统计。缺少边车文件这一观察不用于推断已提交数据状态。 |
| 字节序 | 服务器为 x86_64，Python `sys.byteorder` 为 `little`。小端和相反的 big-endian 数值检查均未执行。 |
| 耗时及写入 | 文件元数据、文件头和进程预检约 0.4 秒，统计未开始。没有执行数据库或边车写入、复制、快照、checkpoint 或服务操作。 |

Memory 全部与 Diary 全部、done、非 done 的生产计数，以及两种字节序的长度、维度和异常分布均为**未统计**。当前没有生产行证据可判断主要维度、非 1024 维向量、异常数量或是否需要重建。文件头、运行环境字节序和配置均无法给历史向量定源。
