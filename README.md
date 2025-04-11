# 背景削除アプリ

このアプリケーションは、画像の背景を自動的に削除するウェブアプリケーションです。Next.jsとPythonを組み合わせたVercelにデプロイ可能な構成になっています。

## 機能

- 画像のアップロード（ドラッグ＆ドロップ、ファイル選択、クリップボードからの貼り付け）
- 背景自動削除（AI技術を活用）
- 複数のフォーマット（PNG、JPEG、WebP）で保存
- 一括ダウンロード（ZIP圧縮オプション付き）
- ダウンロード履歴
- 複数画像の一括処理
- リアルタイム処理進捗表示

## 技術スタック

- **フロントエンド**: Next.js (React)
- **バックエンド**: Python (Next.js API Routes)
- **背景削除ライブラリ**: rembg (U2Net AIモデル)
- **デプロイ環境**: Vercel

## 動作環境

- **Node.js**: v14以上
- **Python**: v3.8以上（v3.12推奨）
- **メモリ**: 処理する画像サイズによって異なりますが、最低2GB以上推奨
- **ディスク容量**: アプリ自体は小さいですが、U2Netモデル（約176MB）が初回実行時にダウンロードされます

## 詳細インストール手順

### ローカル開発環境

1. リポジトリをクローン
   ```bash
   git clone https://github.com/tacyan/background-remover.git
   cd background-remover
   ```

2. Node.js依存関係をインストール
   ```bash
   npm install
   # または
   yarn install
   ```

3. Python環境のセットアップ
   ```bash
   # 仮想環境の作成（推奨）
   python -m venv venv
   
   # Windowsの場合
   venv\Scripts\activate
   
   # macOS/Linuxの場合
   source venv/bin/activate
   
   # 依存関係のインストール
   pip install -r requirements.txt
   ```

4. 開発サーバーを起動
   ```bash
   npm run dev
   # または
   yarn dev
   ```

5. ブラウザで http://localhost:3000 を開く

### トラブルシューティング

1. **onnxruntimeのインストールエラー**
   
   Python 3.12を使用している場合は、requirements.txtの`onnxruntime`バージョンが`>=1.17.0`であることを確認してください。

   ```bash
   pip install onnxruntime>=1.17.0
   ```

2. **初回実行時に処理が遅い**
   
   初回実行時には、U2Netモデル（約176MB）がダウンロードされるため、処理に時間がかかります。2回目以降は高速に動作します。

3. **メモリ不足エラー**
   
   大きなサイズの画像を処理する場合、メモリ不足になることがあります。画像サイズを小さくするか、より多くのメモリを持つ環境で実行してください。

## Vercelへのデプロイ

1. GitHubにプロジェクトをプッシュ
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. Vercelダッシュボードから新しいプロジェクトを作成
   - [Vercel](https://vercel.com)にログイン
   - 「New Project」をクリック

3. GitHubリポジトリを選択
   - リポジトリリストからプロジェクトを選択
   - 「Import」をクリック

4. デプロイ設定
   - フレームワークプリセットは自動的に「Next.js」として検出されます
   - 「Environment Variables」セクションで必要に応じて環境変数を設定
   - 「Deploy」ボタンをクリック

5. デプロイが完了すると、Vercelは自動的にURLを生成します

## 使用方法

1. **画像のアップロード**
   - 「画像を選択」ボタンをクリックしてファイルを選択
   - またはドラッグ＆ドロップで画像をアップロードエリアに移動
   - クリップボードからの貼り付け（Ctrl+V / Cmd+V）も可能

2. **処理中**
   - アップロード後、自動的に背景削除処理が開始
   - 進捗バーで処理状況を確認可能
   - 初回実行時は、AIモデルのダウンロードのため処理に時間がかかります（約1分）

3. **出力形式の選択**
   - 処理完了後、各画像の下部で出力形式（PNG/JPEG/WebP）を選択可能
   - デフォルト形式は設定パネルで変更可能

4. **ダウンロード**
   - 個別画像は「背景なし画像をダウンロード」ボタンでダウンロード
   - 複数画像は「すべての画像をダウンロード」または「すべての画像をZIPでダウンロード」でまとめてダウンロード

5. **ダウンロード履歴**
   - ページ下部にダウンロード履歴が表示され、過去の処理が確認可能

## 注意事項

- 複雑な背景や特殊な画像では、完璧な背景削除ができない場合があります
- 大きなサイズの画像（5MB以上）は処理に時間がかかる場合があります
- 初回実行時はモデルダウンロードのため、「処理中...（100%）」と表示されても実際の処理が完了するまで待つ必要があります

## ライセンス

MIT

## クレジット

- 背景削除技術: [rembg](https://github.com/danielgatis/rembg)
- AIモデル: [U2Net](https://github.com/xuebinqin/U-2-Net)
- 画像処理: [Pillow](https://pillow.readthedocs.io/) 