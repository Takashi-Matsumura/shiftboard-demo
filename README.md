# shiftboard-demo

社内チーム向けデジタル週間スケジュールボードのデモ実装。物理ホワイトボードの運用感をそのまま Web に持ち込むため、Excalidraw キャンバスの上に「月〜日 × 6:00〜21:00」のスケジュール枠（テンプレ）を重ねて、その上にメンバーが自由に書き込み・修正できるようにしています。

## 主な機能

- **認証**: ユーザ名 + パスワード（bcrypt）で登録 / ログイン / ログアウト。HMAC 署名付き Cookie でセッション管理。
- **共有ホワイトボード**: チーム全員で 1 枚の Excalidraw キャンバスを共有。書き込みは debounce して `/api/whiteboard` に保存。
- **スケジュール枠（テンプレ）**: 月〜日 × 30 分刻み（1 時間ごとに濃線、土日は色分け）の罫線を Excalidraw element として inject。`locked: true` で誤操作を防ぐ。
- **テンプレ編集モード**: 「📐 枠を編集」ボタンで枠自体を変更可能なモードに切替。編集中は他ユーザの書き込みを排他ロック（HTTP 423）し、既存の書き込みは半透明で参考表示。

## 技術スタック

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Runtime | React 19 |
| ORM / DB | Prisma 7 + better-sqlite3 (SQLite) |
| Canvas | `@excalidraw/excalidraw` v0.18 |
| Auth | bcryptjs + HMAC 署名 Cookie (自前) |
| Styling | Tailwind CSS v4 |
| Icons | lucide-react |

## セットアップ

```bash
# 依存をインストール
npm install

# .env を用意（.env.example を雛形に）
cp .env.example .env
# SESSION_SECRET は 16 文字以上のランダム値に必ず差し替えること

# DB を初期化（dev.db が prisma/ に作られる）
npx prisma migrate dev

# 開発サーバ起動
npm run dev
```

`http://localhost:3000` を開くと `/login` にリダイレクトされます。`/register` で最初のユーザを作成してください。

## 使い方

1. `/register` で新規アカウントを作成（ユーザ名 3〜32 文字、パスワード 4〜12 文字）
2. ログイン後、月〜日 × 6:00〜21:00 の枠が表示される
3. 枠の上に Excalidraw のツール（フリーハンド・矩形・テキスト等）でスケジュールを書き込む
4. 書き込みは 1.5 秒の debounce 後に自動保存（他ユーザは reload で見える、リアルタイム同期は将来課題）
5. 「📐 枠を編集」を押すと枠自体を変更できるモードに入る。終了時は「編集を終了」を押す
6. 右上の「ログアウト」でセッション破棄

## アーキテクチャ概要

### 認証 (`lib/auth.ts`, `proxy.ts`)

- セッションは DB の `Session` 行 + 署名付き Cookie (`mw_session=<token>.<hmac>`)。HMAC は token 改ざんを防ぎ、真偽判定は常に DB と突き合わせる。
- `proxy.ts`（Next.js 16 のミドルウェア新命名）が `/`, `/login`, `/register` をガードし、未認証なら `/login` へリダイレクト。Cookie の存在のみ見て、失効検証は各 API ルートに委譲。

### ホワイトボードの永続化

- `Whiteboard` テーブルは **シングルトン**（`id="default"`）。チーム全員が同じ 1 行を読み書きする。
- `elements` / `appState` は SQLite に Json 型がないため `String` カラムに JSON.stringify して保存。サーバ側でも grid 要素は除外する多層防御を実装。

### スケジュール枠の生成 (`lib/grid.ts`)

- 月〜日 × 6:00〜21:00 の枠は **DB に保存しない**（クライアント側で `buildGridElements()` を毎回呼んで inject する方針）。
- ただし `Template` テーブルに「ユーザが編集したテンプレ」が保存されていれば、そちらを優先して使う。空ならデフォルトに fallback。
- 全 grid 要素には `customData: { kind: "grid-v1" }` と `locked: true` が付き、ユーザ要素と確実に区別される。
- 物理ホワイトボードのメタファ: 「枠は印刷済みのテンプレ用紙、書き込みだけ消して再利用」。

### テンプレ編集ロック (`/api/template/lock`, `/api/template/unlock`)

- `Template.editingBy` カラムでロックを表現（誰かの user.id が入っていれば編集中）。
- 編集モードに入る → POST `/api/template/lock` でロック取得（他者保有なら 409）。
- 編集モード中、他ユーザが `/api/whiteboard` PUT すると **423 Locked** で弾かれ、UI にトーストが出る。
- ページ unload 時に自動 unlock（fail-safe として手動回復も可能）。

## ディレクトリ構成

```
app/
  api/
    auth/{login,logout,me,register}/route.ts
    template/{route,lock/route,unlock/route}.ts
    whiteboard/route.ts
  components/
    account-badge.tsx
    whiteboard-canvas.tsx
  login/{page,login-form}.tsx
  register/page.tsx
  layout.tsx
  page.tsx              # ヘッダー + 編集モードトグル + キャンバス
lib/
  auth.ts               # bcrypt, HMAC 署名 Cookie, セッション CRUD
  grid.ts               # Excalidraw 用スケジュール枠生成
  prisma.ts             # better-sqlite3 アダプタで PrismaClient
  user.ts               # getUser(req) ヘルパ
prisma/
  schema.prisma         # User / Session / Whiteboard / Template
  migrations/
proxy.ts                # Next.js 16 のミドルウェア (旧 middleware.ts)
```

## 既知の制約 / 将来の拡張

- **リアルタイム同期は未実装**: 他ブラウザに開いている画面はリロードするまで反映されない。SSE / WebSocket での push を検討中。
- **書き込みは「最後に書いた人が勝つ」**: 同一テキストへの同時編集は競合解決していない。
- **テンプレは 1 種類のみ**: 用途別に複数テンプレを切り替える運用は未対応。
- **ロールベース権限は未実装**: 全ユーザがテンプレ編集可能。役割で分けたい場合は User に role フィールド追加が必要。

## License

MIT — see [LICENSE](./LICENSE).
