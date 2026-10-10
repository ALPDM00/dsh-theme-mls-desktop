# 计费：每轮 token 结算

> 这一页原本是 README 里的一节，为公开仓库拆出来独立成页；内容与主线一致，
> 交叉引用已改成文件链接。返回 [README](../README.md)。

## 计费：每轮 token 结算（内置，不是一个独立插件）

主题里带着计费：每一轮**已经结束**的任务，在它的轮次尾巴上贴一张结算小纸条
（`TOKEN USAGE` 绿条 + 八行明细 + 灰色「任务用时」条）。

外观（2026-10-09 按用户实测四轮定稿，模板 `token结算.html` 就是这套语汇）：

- **尺寸只有一个旋钮**：`--mlsb-s:1.5` ⇒ 宽 402px、绿条 42px、明细行 33px、灰条 39px、
  圆角 9px、间隙 7.5px。所有尺寸都写成 `calc(<原始值> * var(--mlsb-s))`，想再大再小只改这一个数；
- **居中**（`margin:12px auto 0`）；展开后整块 ≈370px 高；
- 绿条上**只有 `TOKEN USAGE`**，左右各一个黑色十字（展开时两边一起变 `−`）；
- **字体回到默认栈**：`TOKEN USAGE` 与「任务用时」都用宿主默认字体（标题加粗），
  只有数字走等宽栈 —— 这是模板原本的搭配，Maratype 不再用于这块；
- **圆角**：绿条收起时四角圆；展开时绿条下方变直角、与信息面板无缝拼接，
  面板下方是圆角；灰条四角圆 —— 靠 `body.theme-marathon .mlsb-*` 上的 `!important`
  顶过主题那条全站直角通配规则；
- 绿条/面板与灰条之间留一个间隙（`--mlsb-gap`），两者不紧贴；
- 灰条里只有「任务用时」+ `mm:ss`（原 `i` 角标已按用户要求去掉，代码注释保留）；
- **动效**（都很短）：落地时**从中间向两端展开**（`mlsb-reveal`，`.18s`；用 `clip-path`
  而不是 `scaleX`，否则卡片里的字会被压扁）；展开/收起走 `grid-template-rows:0fr → 1fr`
  + 透明度过渡（`.2s`，模板的做法 —— `display` 不能过渡）；绿条下方的圆角变化也跟着过渡。
  `prefers-reduced-motion: reduce` 下三条全部关掉。

**开关**：主题设置（设置对话框里那个 nav cell）里多了一行 **「每轮 Token 结算」**，
与「背景动画」并列、互不影响，默认开，存在 `localStorage['mar.billing.v1']`。
关掉 = 立刻摘掉页面上所有纸条 + 停止轮询计费接口；打开 = 立即拉一次并恢复贴纸条。

> 纸条出现有 1–2s 的延迟，因为浏览器半侧是**轮询** `/dsh-mls-billing/state`（默认 2s）。
> 入场动画就是用来盖住这一下的；嫌慢的话 `src/client.template.js` 里的 `BILLING_POLL_MS`
> 就是那个常数（改完 `npm run build`）。

**重启之后也还在**（2026-10-09 第四、五轮修的真实缺陷）：

纸条挂在**已经渲染出来的轮次**上，而宿主重启后折叠器是空的，所以只存「会话总量」不够。
现在分三层：

1. **逐轮持久化**：账本里存 `ledger.sessions[sid].turns`（token 桶 + `startedAt`/`endedAt`，
   每会话最近 40 轮），在轮次边界（`turn/start`·`assistant/message`·`step/end`·`turn/end`）同步；
   启动时 `hydrateSessions` 回填。
2. **精确确认"显示的是哪段对话"**：`ctx.get('sessions').list.current`（DSH 自己的选中项），
   拿不到才退回"最近有账的会话" —— 这样"看着 A 会话、后台在跑 B 会话"不会把数字贴错。
3. **旧轮次回填**（第五轮）：本功能上线**之前**跑过的轮次从来没有逐轮数据
   （宿主半边的代码要重启才生效，所以"上线后重启、再看上一段对话"必然命中这一格 ——
   实测诊断：本话在账本里 `requests=215 / turns=0`，而重启后新跑的那个工具区会话是 `turns=1`）。
   客户端轮询时把 `?session=<正在显示的会话>` 带给宿主，宿主发现这段对话没有逐轮数据就
   **从 DSH 自己的持久化服务重放一遍**：

   ```js
   const { events } = await ctx.sessionPersistence.readFrom(id, 0)  // 走 DSH 的服务，不碰磁盘格式
   const replay = createFold(); for (const e of events) replay.ingest(id, e, isPeakTime)
   fold.installTurns(id, replay.snapshot()…turns); saveTurns(ledger, id, …)
   ```

   每个会话只试一次（`backfillTried`）、8s 超时、失败静默（纸条是锦上添花，绝不能拖死 `/state`）；
   结果写进账本，所以第二次重启不再需要回放。`GET /dsh-mls-billing/backfill?session=<id>`
   可手动触发一次看结果。

### 它长在哪、为什么

锚点是 DSH 自己的语义属性 **`[data-turn-tail="<轮次号>"]`**（`dsh-client-ui-chat` 的
`TurnTailNodeView`；比哈希类名稳），纸条插在**动作行之前**，所以读起来是
「任务结束 → 结算 → 复制/分支」。由此得到三条性质：

- 它**跟着转录滚动**（位置由转录决定，不再是浮在输入框上方、滚动时纹丝不动的东西）；
- 切会话 = 转录整块换掉 = 纸条跟着消失，**没有跨会话的展开状态**；
- 宿主重渲染后由 1.2s 巡扫补回（`sweepReveals()` 里调 `billingTick()`），且不会重复贴。

只有在 `turn/end` 到过（`closed`）之后才贴：任务没结束就没有「本轮用时」可言。
没有用量的空轮次（被拒绝、空输入）不长纸条。

### 三个数字的来路

| 显示 | 来源 |
| --- | --- |
| 消耗/输入/输出/缓存命中/命中率/未命中 | 该轮 `usage` 四桶（互不重叠，`out` 已含 reasoning；命中率 = `hit/(hit+miss)`） |
| 本次费用 | 逐笔按 `step/end.time` 定峰谷档后计价（DeepSeek 官方分时价；缓存写入按未命中价） |
| **任务用时** | `turn/end.time − turn/start.time`，在 `turn/end` 之后**冻住**（DSH 自己的页脚两种模式都不显示耗时） |

未定价模型会让状态行变成 `UNPRICED` 并走告警色 —— 走的是兜底价，不能默默算进总额。

### 与 DSH 自己的「每轮用量」的关系

DSH 在同一个地方已经有一行可展开的用量（`ui-chat.performanceUsage = detailed` 时），
但它**只讲 token、不讲钱**，而且**不显示耗时**（上面的 README 原文：两种模式的已完成轮次页脚
均不显示耗时）。这张纸条补的正是这两样：**¥ 费用** + **本轮用时**，外加一个固定口径的命中率。

### 宿主半边

`index.js` 在 `apply()` 里动态 `import('./billing/host.mjs')` —— 计费与主题同生共死
（主题禁用即全部拆掉），而且**计费挂了也绝不拦住主题加载**（它只是可选能力）。
宿主提供三条只读/回环接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/dsh-mls-billing/state` | 完整快照（浏览器半侧每 2s 轮询它） |
| GET | `/dsh-mls-billing/health` | 账本路径、账本/余额错误、已消费事件数 |
| POST | `/dsh-mls-billing/balance/refresh` | 强制刷新余额（仅回环） |

非回环 Host 一律 403（除非写进 `DSH_MLS_BILLING_TRUSTED_HOSTS`）；跨站标记/跨源 Origin 一律 403；
凭据永不下发浏览器。账本在 `$DSH_HOME/storages/mls-billing-ledger.json`（tmp+rename 原子写，
读入不信任磁盘形状，坏了只丢历史、绝不阻断宿主）。
