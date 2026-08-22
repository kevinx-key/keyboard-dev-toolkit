# KDT AI 使用指南

> 读完本文档，即可通过 MCP 工具或 CLI 生成键盘配列、编辑键位、导出 SVG/DXF。

## KLE 行格式（核心数据格式）

布局是一个 **JSON 数组**，每个元素代表一行：

```json
[
  { "name": "我的65%", "author": "AI" },
  ["Esc", { "x": 1 }, "F1", "F2", "F3", "F4", { "x": 0.5 }, "F5", "F6", "F7", "F8"],
  [{ "y": 0.5 }, "~\n`", "!\n1", "@\n2", "#\n3"]
]
```

- **首元素**可选：元数据对象（含 `name`、`author`、`notes`、`backcolor` 等）。如果首元素只含 KLE 键属性（如 `{x:1}`），会被当作行内属性对象处理，**不是**元数据。
- **后续元素**：行数组。字符串 = 键标签，对象 = 属性继承（sticky）。
- **标签格式**：`"\n"` 分隔 12 个标签位（主标签 + 辅助标签）。常用 `"\n"` 单个字符串表示主标签，如 `"Q"`、`"Esc"`。
- **换行 + 多标签**：`"Q\n\n\n\n\n\nW"` 表示主标签 Q、位置 6 标签 W。

## 键属性（sticky 对象字段）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `x` | number | 0 | X 偏移（键单位） |
| `y` | number | 0 | Y 偏移（键单位） |
| `w` | number | 1 | 宽度（键单位） |
| `h` | number | 1 | 高度（键单位） |
| `r` | number | 0 | 旋转角度（度） |
| `rx` | number | 0 | 旋转中心 X（键单位） |
| `ry` | number | 0 | 旋转中心 Y（键单位） |
| `c` | string | "#c8c8c8" | 背景色（#rrggbb） |
| `t` | string | "#000000" | 文字颜色 |
| `d` | boolean | false | 装饰键（无实体） |
| `n` | boolean | false |  Home 键凸点 |
| `l` | boolean | false | 阶梯键（如 Caps Lock） |
| `w2` | number | 0 | 非矩形键第二段宽度 |
| `h2` | number | 0 | 非矩形键第二段高度 |
| `x2` | number | 0 | 非矩形键第二段 X 偏移 |
| `y2` | number | 0 | 非矩形键第二段 Y 偏移 |

## 操作语法（ops）

操作是一个 JSON 数组，每项格式 `{op, ...args}`。操作按顺序应用，delete 后索引立即重排。

### set_label — 设置主标签

```json
{"op": "set_label", "index": 0, "label": "Esc"}
```

### set_prop — 设置任意属性

```json
{"op": "set_prop", "index": [0, 1, 2], "prop": "w", "value": 1.5}
{"op": "set_prop", "index": 0, "prop": "r", "value": 90}
{"op": "set_prop", "index": 0, "prop": "c", "value": "#ff0000"}
```

支持的属性：`x y w h x2 y2 w2 h2 r rx ry align labelSize f2 c t d g l n p sm sb st stab labels fa textSize textColor`

### move — 平移键位

```json
{"op": "move", "index": [0, 1, 2, 3], "dx": 0, "dy": 1}
```

### place — 绝对定位

```json
{"op": "place", "index": 5, "x": 6.25, "y": 1}
```

### delete — 删除键

```json
{"op": "delete", "index": [0, 5]}
```

### add_key — 追加键

```json
{"op": "add_key", "x": 0, "y": 10, "w": 6.25, "label": "Space"}
```

### set_meta — 修改元数据

```json
{"op": "set_meta", "name": "自定义配列", "author": "AI"}
```

## 预设模板

| 名称 | 键数 | 类型 |
|------|------|------|
| Default 60% | 61 | 60% ANSI |
| ANSI 104 | 104 | 全尺寸 |
| ISO 105 | 105 | 欧洲布局 |
| ErgoDox | 76 | 人体工学 |
| Atreus | 44 | 分裂正交 |
| Planck | 47 | 正交 40% |
| Kinesis Advantage | 84 | 分裂凹形 |
| Keycool 84 | 84 | 75% |
| Leopold FC660m | 66 | 65% |

## 导出格式

| format | 产物 | 说明 |
|--------|------|------|
| `layout-svg` | .svg | 配列可视化图（键帽 + 标签） |
| `pcb` | .svg + .dxf | PCB 开孔图（轴体 + 卫星轴 + LED） |
| `plate` | .svg + .dxf | 定位板开孔图（轴体 + 卫星轴） |

**Pro 功能**（QMK 导出、KiCad、STP）未在 AI 工具层开放。

## 典型工作流（MCP）

```
1. list_presets → 选择预设
2. create_layout 用预设创建文件
3. edit_layout set_label/set_prop/move/delete 微调
4. export_layout 导出 SVG/DXF
5. share_url 生成可分享链接
```

## 典型工作流（CLI）

```bash
npx tsx tools/cli.ts presets
npx tsx tools/cli.ts new "Default 60%" my-board.json
echo '[{"op":"set_label","index":0,"label":"Esc"},{"op":"set_prop","index":0,"prop":"r","value":90}]' > ops.json
npx tsx tools/cli.ts edit my-board.json --ops-file ops.json
npx tsx tools/cli.ts export my-board.json --format layout-svg
npx tsx tools/cli.ts url my-board.json
```

## 坐标系

- 1 键单位 = 19.05mm（标准 Cherry MX 间距）
- 布局左上角为原点，X 向右，Y 向下
- 键的坐标 `(x, y)` 表示左上角位置
- `r` 旋转默认绕 `(rx, ry)` 旋转中心（通常为同一键的中心）
