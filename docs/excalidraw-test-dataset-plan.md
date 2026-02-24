# Excalidraw 変換テストデータ計画

## 1. 目的

Excalidraw JSON から `SVG/PNG` への変換品質を、段階的なテストデータ群で継続的に検証できるようにする。  
対象は以下:

- 要素の描画破綻検出
- 座標/回転/透過/スケールなどの幾何変換の破綻検出
- 文字列や異常データに対する耐性確認

## 2. 成果物（計画）

- テストデータ配置ディレクトリ（案）: `tests/fixtures/`
- ケース一覧ドキュメント（本書）
- 出力確認先（案）: `tests/output/svg/`, `tests/output/png/`
- 将来の自動化前提:
  - `json -> svg` 実行
  - 必要ケースのみ `svg -> png` 実行
  - 生成物の目視確認 + 最低限の機械確認（ファイル存在・サイズ・XML妥当）

## 3. データセット構成方針

### 3.1 レベル分割

- `L1-basic`: まず壊れないことを確認する最小ケース
- `L2-composition`: 複数要素の重なり/関係線など実運用に近いケース
- `L3-edge`: 変換が壊れやすい境界条件
- `L4-invalid`: 異常値・欠損値への防御動作（失敗/フォールバック）確認

### 3.2 ファイル命名規約（案）

- `l{level}-{category}-{slug}.json`
- 例:
  - `l1-shape-rectangle-min.json`
  - `l2-diagram-class-medium.json`
  - `l3-text-multiline-escape.json`
  - `l4-invalid-missing-elements.json`

## 4. テストケース一覧（初期案）

## L1-basic（基礎）

1. `rectangle` 単体
- 狙い: 最小構造でSVG生成できる
- 観点: `stroke/fill/stroke-width/opacity`

2. `ellipse` 単体
- 狙い: 半径計算の正しさ
- 観点: `cx/cy/rx/ry`

3. `diamond` 単体
- 狙い: 頂点計算の正しさ
- 観点: polygon 4点の順序

4. `line` 単体（2点）
- 狙い: `points` の絶対座標化
- 観点: polyline の始終点

5. `arrow` 単体（2点）
- 狙い: 矢印ヘッド生成
- 観点: 本体 + ヘッド polygon

6. `text` 単体（1行）
- 狙い: フォント属性・文字描画
- 観点: `font-family/font-size`

## L2-composition（複合）

1. 基本6要素を1枚に配置
- 狙い: バウンディング計算と全体レイアウト
- 観点: 余白・viewBox・背景色

2. クラス図（中規模）
- 狙い: 実運用に近い図の安定性
- 観点: 複数テキスト、線、矢印、重なり

3. 要素の重なり順確認
- 狙い: `elements` 配列順の描画順確認
- 観点: 後ろ/前の重なりが意図通り

4. 回転を含む図
- 狙い: 要素中心回転の正しさ
- 観点: rectangle/ellipse/text の `transform=rotate`

## L3-edge（境界条件）

1. 負座標を含む図
- 狙い: 原点寄せロジックの確認
- 観点: 出力が切れない

2. `width/height` が負値の要素
- 狙い: bounds の min/max 安全性
- 観点: 破綻しないこと

3. 透明背景・透明度混在
- 狙い: `backgroundColor: transparent` と `opacity`
- 観点: `fill="none"` と alpha反映

4. 複数行テキスト
- 狙い: `<tspan>` 分割
- 観点: 行間計算と改行処理

5. XMLエスケープ文字を含むテキスト
- 狙い: `& < > " '` の安全出力
- 観点: 不正XMLにならない

6. 極端な `padding` / `scale`
- 狙い: スケール時の座標・線幅追随
- 観点: レンダリング破綻なし

7. `points` が空の line/arrow
- 狙い: フォールバック動作確認
- 観点: 例外が出ない

8. 同一点が連続する arrow
- 狙い: 矢印方向計算の安定性
- 観点: ヘッド計算で NaN を出さない

9. 未対応 type 混在
- 狙い: 無視フィルタの安全性
- 観点: 対応要素のみ描画

## L4-invalid（異常系）

1. `elements` 欠損
- 狙い: 入力バリデーションエラー
- 期待: 終了コード `1`

2. 壊れたJSON
- 狙い: パースエラー処理
- 期待: 終了コード `1`

3. 数値属性が文字列/NaN
- 狙い: `ensureNumber` による既定値補完
- 期待: 変換継続

4. 出力パス不正（将来CIではモック）
- 狙い: 書き込みエラー処理
- 期待: 終了コード `1`

## 5. ケースごとのメタ情報（テンプレート）

各 fixture に対応して `manifest` へ以下を持つ:

- `id`
- `level` (`L1`〜`L4`)
- `title`
- `description`
- `input` (json path)
- `expected`:
  - `shouldSucceed` (bool)
  - `checkSvgXml` (bool)
  - `checkPng` (bool)
  - `notes` (目視観点)

## 6. 実装ステップ（次アクション）

1. ディレクトリ雛形を作成  
`tests/fixtures/{l1,l2,l3,l4}`, `tests/output/{svg,png}`

2. まず `L1` を全件作成（6ケース）

3. `L2` の代表2ケース（混在図 + クラス図）を作成

4. `L3` から壊れやすい3ケースを先行投入  
`text escape`, `negative coords`, `empty points`

5. `manifest.json` を追加し、将来のテストランナー入力を固定化

## 7. 受け入れ基準（この計画の完了条件）

- ケース一覧が `L1〜L4` で定義されている
- 各ケースに狙いと確認観点がある
- 次の実装順序が明確になっている

## 8. ゴールデン更新フロー（運用）

1. 新しいテストデータ（fixture）を `tests/fixtures/` に追加
2. PNG ゴールデン生成を実行  
`bun run golden:png`  
（例: `L1` のみ更新する場合は `bun run golden:png -- --level l1`）
3. `tests/output/png/` の差分を目視確認
4. fixture とゴールデン差分をコミット
