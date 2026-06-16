# テキスト読み上げ（tts-site）

ブラウザだけで動作する、完全無料・登録不要のテキスト読み上げサイト。
入力テキストを外部に送信せず、Web Speech API（端末内蔵音声）で読み上げる。

## 特徴

- 完全無料・登録不要
- 文字数制限なし（文単位で分割して連続再生）
- 入力テキストを外部送信しない（ブラウザ内で完結）
- 長文でも止まりにくい（チャンク分割＋keepalive）
- 選んだ位置から読み上げ／停止位置から続き再生に対応

## 構成

```
tts-site/
├── CLAUDE.md           # Claude Code への作業指示
├── tts-site-spec.md    # 開発仕様書
├── README.md           # このファイル
├── index.html          # トップ（読み上げツール本体）
├── about.html          # 使い方・特徴・FAQ
├── privacy.html        # プライバシーポリシー
├── guide/
│   ├── chatgpt-tts.html    # ChatGPT読み上げガイド
│   └── long-text-tts.html  # 長文校正ガイド
├── assets/
│   ├── style.css       # 共通スタイル
│   ├── tts.js          # 読み上げロジック（誤読辞書含む）
│   ├── favicon.svg     # ファビコン
│   └── og.png          # OGP画像（1200×630）
├── robots.txt
└── sitemap.xml
```

## ローカルでの動作確認

Node.js は不要。リポジトリのルートで以下のいずれか。

```
python -m http.server 8000
```

ブラウザで `http://localhost:8000/` を開く。
または VS Code / Cursor の Live Server 拡張で `index.html` を開く。

## デプロイ（Cloudflare Pages 想定）

- ビルドコマンド：なし（静的サイト）
- 出力ディレクトリ：ルート（`/`）
- フレームワークプリセット：None

## 公開URL確定後にやること（重要）

現状、各ファイルの絶対URLは仮値 `https://tts-site.pages.dev/` を入れている。
本番URL（独自ドメイン or 実際の `*.pages.dev`）が決まったら、以下を一括置換する。

- `index.html` … canonical / og:url / og:image / twitter:image / JSON-LD の url
- `about.html` … canonical / og:url / og:image
- `privacy.html` … canonical / og:url / og:image
- `robots.txt` … Sitemap 行
- `sitemap.xml` … 各 `<loc>`

## 未対応・今後の課題

- 収益化（広告）は v1 では未実装。導入時は `privacy.html` に広告配信・Cookie の記述を追記する。
- 設定の保存（localStorage）・ダークモードは v2 候補。

詳細は `tts-site-spec.md` を参照。
