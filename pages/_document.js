/**
 * カスタムドキュメントコンポーネント
 * 
 * HTMLドキュメントの構造をカスタマイズし、メタタグやスタイルシートなどを追加します。
 */

import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="ja">
      <Head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="画像の背景を簡単に削除できるウェブアプリ" />
        <meta name="keywords" content="背景削除, 画像編集, 透過画像, 写真加工" />
        <meta name="author" content="背景削除メーカー" />
        <meta property="og:title" content="背景削除メーカー" />
        <meta property="og:description" content="画像の背景を簡単に削除できるウェブアプリ" />
        <meta property="og:type" content="website" />
      </Head>
      <body>
        <Main />
        <NextScript />
        <div id="notification" className="notification" style={{ display: 'none' }}></div>
      </body>
    </Html>
  )
} 