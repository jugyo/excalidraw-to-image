# Excalidraw-to-SVG PoC 設計書

## 1. 目的

Excalidraw JSON からブラウザ非依存で SVG を生成できることを検証する。

PoC では次を達成条件とする。
- CLI で `input.json -> output.svg` が実行できる
- 基本要素が崩れず描画される
- 生成 SVG が `resvg` 等の既存ツールで PNG 化できる

## 2. スコープ

### 2.1 対象 (PoC)
- 要素タイプ:
  - `rectangle`
  - `ellipse`
  - `diamond`
  - `line`
  - `arrow`
  - `text`
- 対応属性 (最小):
  - 位置・サイズ: `x`, `y`, `width`, `height`, `points`
  - 見た目: `strokeColor`, `backgroundColor`, `strokeWidth`, `opacity`, `angle`
  - 文字: `text`, `fontSize`, `fontFamily`, `lineHeight`
- ルート:
  - `elements`
  - `appState.viewBackgroundColor`

### 2.2 非対象 (PoC)
- Excalidraw 完全互換
- free draw / image / frame / group / bind 高度挙動
- rough.js の手描き質感再現
- テキストの高度レイアウト（自動折返し、container厳密整列）

## 3. 成果物

- 実行CLI: `src/cli/excalidraw-to-svg.ts`
- ドキュメント: 本設計書
- サンプル入出力:
  - `diagram.json` -> `output/diagram.svg`

## 4. アーキテクチャ

1. `CLI`:
   - 引数を解析 (`--in`, `--out`, `--padding`, `--scale`)
2. `Loader`:
   - Excalidraw JSON を読込、最低限バリデーション
3. `Normalizer`:
   - 欠損値を既定値で補完
   - `points` を絶対座標へ変換
4. `Bounds`:
   - シーンの外接矩形を計算
5. `SVG Renderer`:
   - 要素ごとに SVG ノードを生成
   - `<svg>` を構築し文字列化
6. `Writer`:
   - SVG ファイルとして保存

## 5. SVG 生成方針

### 5.1 座標系
- シーン最小座標を原点へ寄せる
- `padding` を加える
- `scale` は最終座標に乗算

### 5.2 要素マッピング
- `rectangle` -> `<rect>`
- `ellipse` -> `<ellipse>`
- `diamond` -> `<polygon>`
- `line` -> `<polyline>`
- `arrow` -> `<polyline>` + `<polygon>` (矢印ヘッド)
- `text` -> `<text>` (+ 複数行は `<tspan>`)

### 5.3 回転
- `angle != 0` の場合、要素中心基準で `transform="rotate(...)"`

### 5.4 スタイル
- `stroke`, `fill`, `stroke-width`, `opacity` を属性化
- `backgroundColor: transparent` は `fill="none"`

### 5.5 エスケープ
- テキストは XML エスケープを必須化
  - `& < > " '` の置換

## 6. フォント戦略 (PoC)

- SVG には `font-family` を出力するのみ（埋め込みはしない）
- 既定は `Noto Sans JP, sans-serif`
- `fontFamily` 数値コードは当面単純マップ:
  - `1 -> Noto Sans JP`
  - `2 -> Virgil`
  - `3 -> Cascadia`

備考:
- 最終描画フォントは SVG レンダラ（resvg等）のフォント解決に依存する
- 次フェーズで `@font-face` 埋め込みを検討

## 7. CLI 仕様 (PoC)

```bash
bun run src/cli/excalidraw-to-svg.ts \
  --in diagram.json \
  --out output/diagram.svg \
  --padding 24 \
  --scale 1
```

終了コード:
- `0`: 成功
- `1`: 引数不正 / JSON不正 / 書き込み失敗

## 8. 既知の制約

- Excalidraw 本家と完全一致しない
- テキストの幅計測は行わないため、はみ出しが起こりうる
- 矢印バインディングや装飾の細部は未対応

## 9. テスト観点

- 正常系:
  - `diagram.json` からSVG生成できる
  - 出力 SVG が XML として妥当
- 表示系:
  - 各要素タイプが最低1つずつ描画される
  - `angle`, `opacity`, `background` が反映される
- 互換確認:
  - `resvg` で `svg -> png` 変換成功

## 10. 実装ステップ

1. `src/cli/excalidraw-to-svg.ts` 雛形作成
2. bounds/座標変換ロジック移植
3. 要素ごとのSVG生成を追加
4. テキストのXMLエスケープ対応
5. サンプルファイルで生成確認
6. READMEへ実行例追記

## 11. 次フェーズ

- `@font-face` 埋め込み対応
- `freedraw` と `image` の追加
- lint/inspect サブコマンド追加
- `SVG -> PNG` までをワンコマンド化 (`resvg` 連携)
