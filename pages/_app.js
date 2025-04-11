/**
 * アプリケーションコンポーネント
 * 
 * グローバルスタイルシートを適用し、すべてのページで共有されるレイアウトを提供します。
 */

import '../styles/globals.css'

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

export default MyApp 