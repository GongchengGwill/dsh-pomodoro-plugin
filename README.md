# 🐳 DSH Pomodoro — Q版番茄钟插件

一个跑在 [DeepSeek Harness](https://github.com/topics/deepseek-harness) **Web GUI 悬浮层** 上的番茄钟插件：
可自由拖动、可配置番茄个数、到点弹出会动的小人提醒，附带四套随状态切换的 Q 版大头表情。

> 纯前端实现，**零依赖、零构建**，不修改 DSH 源码，通过动态 Cordis 插件挂载。

---

## ✨ 功能

| 功能 | 说明 |
|---|---|
| ⏱️ 番茄循环 | 默认 **25 分钟专注 + 5 分钟休息**，可改 专注 5–90 分钟、休息 1–30 分钟 |
| 🔢 番茄个数 | 1–12 个，圆点进度条显示已完成 / 当前 / 待完成 |
| 🎯 快捷预设 | `25/5`、`50/10`、`15/3` 一键切换 |
| 🖱️ 自由拖动 | 小球 / 胶囊 / 面板都能拖，位置写入 `localStorage`，刷新后保持 |
| 🐳 Q 版大头 | 蓝发大头形象，**四种状态四套表情**（见下） |
| 🎉 到点动画 | 全屏庆祝卡：小人弹跳、星星闪烁、彩纸飘落 + `WebAudio` 提示音 |
| 🌗 主题自适应 | 全部使用 DSH 主题 token（`--dsw-alias-*`），浅色 / 深色自动适配 |
| ♿ 无障碍 | 尊重 `prefers-reduced-motion`，开启后自动关闭所有动画 |
| 🔒 精确计时 | 基于**截止时间戳**而非累加 tick，切后台标签页 / 系统休眠回来不漂移 |

## 🐳 四套表情

| 状态 | 小人表情 |
|---|---|
| 待开始 | 超大困眼、上眼睑压平、小嘴微张，旁边飘音符 `♪` |
| 专注中 | 眼睑下压成锐利眼神、斜挑眉、抿嘴，两滴汗珠晃动 |
| 休息中 | 眼睛闭成 `‿` 弧线、张嘴，头顶冒 `z z`，整颗头左右摇 |
| 时间到 | 笑成 `^ ^`、张嘴大笑、腮红加深、整颗头弹跳，周围星星闪 |

全部为 **内联 SVG 手绘**（无图片资源、无外部字体），配色由主题变量驱动。

## 📦 安装

这是一个 **DSH 动态 Cordis 插件**（Client 半边）。在 DSH Web GUI 的会话里，让 Agent 执行：

```
cordis_define  →  cordis_run
```

或者直接把 `client.js` 交给 Agent，并附上这句话：

> 把这个文件用 `cordis_define` 定义成一个新的动态 Cordis 插件（`code.client` 就是文件内容），
> 然后用 `cordis_run` 激活它。

### 手动方式

1. 复制 `client.js` 的全部内容
2. 调用 `cordis_define`，把内容原样填入 `code.client`
3. 用返回的 `pluginId` / `packageId` 调用 `cordis_run`（`mode: "run"`）
4. 在运行卡片上授权（Client 半边需要用户授权）
5. 右下角出现小人即安装成功

> ⚠️ **动态插件是进程内临时的**：DSH 重启后消失，需要重新跑一次。
> 想随进程自动加载，请把它做成持久化的 DSH composition（见下）。

### 技术约束（给改造者）

`code.client` 是**函数体**，不是模块，所以：

- ❌ 不能用 `import` / `require`（`require is not available in a dynamic client half`）
- ❌ 不能声明 `const React = ...` —— 这会遮蔽注入的 `React` 闭包符号
- ✅ `React` 直接可用，UI 必须用 `React.createElement(...)`，不能写 JSX
- ✅ 可用符号只有：`React`、`ctx`、`host`、`styles`、`console`
- ✅ 计时器必须走 `ctx.timer`（需 `inject: ['timer']`），不能用全局 `setTimeout`
- ✅ 所有副作用挂在 `ctx.effect(...)` 上，保证停止 / 升级时被回收

## 🗂️ 目录结构

```
.
├── client.js          # 插件源码（cordis_define 的 code.client 函数体，1056 行）
├── package.json       # 元数据（主题标签等）
├── LICENSE            # MIT
└── README.md
```

## 🏷️ 标签

`deepseek-harness` · `dsh` · `cordis` · `pomodoro` · `plugin`

## 📄 许可

代码以 **MIT** 发布，可自由使用、修改、再分发。

## 🙏 说明

页面上的 Q 版小人（蓝发大头、奶油色荷叶边头饰、蝴蝶结衣领）是**原创矢量绘制**，
仅参考了用户提供的风格样本的配色与气质，**未复制任何官方美术素材**，也与任何作品无隶属关系。
如果你要替换成自己的形象，改 `client.js` 里的 `ChibiMascot` 函数即可 —— 它只接收 `{ pose, size }` 两个参数。
