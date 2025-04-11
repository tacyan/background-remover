/**
 * 背景削除アプリのメインページコンポーネント
 * 
 * このコンポーネントは背景削除アプリのメインインターフェースを提供します。
 * 画像のアップロード、背景削除、ダウンロード機能を実装しています。
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import Head from 'next/head';
import axios from 'axios';
// react-dropzoneを使用しない
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import styles from '../styles/Home.module.css';

// 最大再試行回数
const MAX_RETRIES = 2;
// 再試行待機時間（ミリ秒）
const RETRY_DELAY = 1500;

export default function Home() {
  // 状態管理
  const [images, setImages] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadHistory, setDownloadHistory] = useState([]);
  const [settings, setSettings] = useState({
    defaultFormat: 'png',
    quality: 0.8,
    resize: 100,
    batchZip: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [processingFiles, setProcessingFiles] = useState(new Set()); // 処理中のファイル追跡用
  const downloadProgressRef = useRef(null);
  const fileInputRef = useRef(null);

  /**
   * 通知を表示する関数
   * 
   * @param {string} message - 表示するメッセージ
   * @param {boolean} isError - エラーメッセージかどうか
   */
  const showNotification = useCallback((message, isError = false) => {
    const notification = document.getElementById('notification');
    if (notification) {
      notification.textContent = message;
      notification.style.display = 'block';
      notification.className = `${styles.notification} ${isError ? styles.error : ''}`;
      setTimeout(() => {
        notification.style.display = 'none';
      }, 3000);
    }
  }, []);

  /**
   * APIリクエストを実行する関数（再試行ロジック付き）
   * 
   * @param {FormData} formData - フォームデータ
   * @param {string} fileId - ファイルID
   * @param {number} retries - 再試行回数
   * @returns {Promise<Object>} レスポンス
   */
  const callRemoveBgAPI = useCallback(async (formData, fileId, retries = 0) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90秒でタイムアウト
      
      const response = await axios.post('/api/remove-bg', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-Request-ID': fileId, // 一意なIDをヘッダーに追加
        },
        responseType: 'blob',
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setProgress(percentCompleted);
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      // 429エラー（リクエスト制限）またはタイムアウトの場合、再試行
      if ((err.response && err.response.status === 429) || 
          err.name === 'AbortError' || 
          err.code === 'ECONNABORTED') {
        if (retries < MAX_RETRIES) {
          console.log(`リトライ中... (${retries + 1}/${MAX_RETRIES})`);
          // 少し待ってから再試行
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          return callRemoveBgAPI(formData, fileId, retries + 1);
        }
      }
      throw err; // 再試行回数を超えた場合またはその他のエラーの場合、エラーを投げる
    }
  }, []);

  /**
   * ファイルを処理する関数
   * 
   * @param {File[]} files - 処理するファイルの配列
   */
  const processFiles = useCallback(async (files) => {
    if (loading) return; // 既に処理中の場合は何もしない
    
    setLoading(true);
    setProgress(0);
    setError(null);
    
    // 入力フィールドを即座にリセット（処理開始時点で）
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    const totalFiles = files.length;
    const newImages = [];
    const filesToProcess = Array.from(files).filter(file => {
      // 既に処理中のファイルはスキップ
      const fileId = `${file.name}-${file.size}-${file.lastModified}`;
      return !processingFiles.has(fileId);
    });
    
    if (filesToProcess.length === 0) {
      setLoading(false);
      showNotification('これらのファイルは既に処理中か処理済みです', false);
      return;
    }
    
    // 処理中のファイルを追跡
    const newProcessingFiles = new Set(processingFiles);
    filesToProcess.forEach(file => {
      const fileId = `${file.name}-${file.size}-${file.lastModified}`;
      newProcessingFiles.add(fileId);
    });
    setProcessingFiles(newProcessingFiles);

    try {
      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        const fileId = `${file.name}-${file.size}-${file.lastModified}`;
        
        showNotification(`${file.name} を処理中...（${i + 1}/${filesToProcess.length}）`, false);
        
        // FormDataを作成
        const formData = new FormData();
        formData.append('file', file);
        formData.append('output_format', settings.defaultFormat);
        
        try {
          // APIにリクエストを送信（再試行ロジック付き）
          const response = await callRemoveBgAPI(formData, fileId);
          
          // レスポンスからオブジェクトURLを作成
          const original = URL.createObjectURL(file);
          const processed = URL.createObjectURL(response.data);
          
          newImages.push({
            original,
            processed,
            name: file.name,
            format: settings.defaultFormat,
            type: response.headers['content-type'],
            blob: response.data,
            id: fileId
          });
        } catch (err) {
          // このファイルの処理をスキップし、処理中リストから削除
          newProcessingFiles.delete(fileId);
          
          if (err.name === 'AbortError' || err.code === 'ECONNABORTED') {
            console.error(`ファイル処理がタイムアウトしました (${file.name}):`, err);
            showNotification(`${file.name}の処理中にタイムアウトしました。ファイルサイズが大きすぎる可能性があります。`, true);
          } else if (err.response && err.response.status === 429) {
            console.error(`リクエスト制限エラー (${file.name}):`, err);
            showNotification(`${file.name}は既に処理中です。しばらく待ってから再試行してください。`, true);
          } else if (err.response && err.response.status === 500) {
            console.error(`サーバーエラー (${file.name}):`, err);
            
            // 詳細なエラーメッセージを取得（可能な場合）
            let errorDetails = '';
            try {
              if (err.response.data) {
                const reader = new FileReader();
                const textPromise = new Promise((resolve) => {
                  reader.onload = () => resolve(reader.result);
                  reader.readAsText(err.response.data);
                });
                const text = await textPromise;
                try {
                  const jsonData = JSON.parse(text);
                  errorDetails = jsonData.error || '';
                } catch (e) {
                  errorDetails = text.substring(0, 100); // 長すぎる場合は切り詰める
                }
              }
            } catch (readError) {
              console.error('エラーレスポンスの読み取りに失敗:', readError);
            }
            
            showNotification(
              `${file.name}の処理中にサーバーエラーが発生しました。${errorDetails ? `詳細: ${errorDetails}` : ''}`, 
              true
            );
          } else {
            console.error(`ファイル処理エラー (${file.name}):`, err);
            const errorMsg = err.response && err.response.data && err.response.data.error
              ? err.response.data.error
              : err.message || '不明なエラー';
            showNotification(`${file.name}の処理中にエラーが発生しました: ${errorMsg}`, true);
          }
        }
        
        setProgress(((i + 1) / filesToProcess.length) * 100);
      }

      // 処理中リストを更新
      setProcessingFiles(newProcessingFiles);

      if (newImages.length > 0) {
        setImages(prevImages => [...prevImages, ...newImages]);
        showNotification(`${newImages.length}個の画像の処理が完了しました！`);
      } else {
        showNotification('処理完了した画像はありません。すべての画像の処理に失敗しました。', true);
      }
    } catch (err) {
      console.error('処理エラー:', err);
      setError(`エラーが発生しました: ${err.message || '不明なエラー'}`);
      showNotification(`エラーが発生しました: ${err.message || '不明なエラー'}`, true);
    } finally {
      setLoading(false);
      // 入力フィールドのリセットは処理開始時に既に行っているため、ここでは不要
    }
  }, [settings.defaultFormat, loading, processingFiles, showNotification, callRemoveBgAPI]);

  /**
   * ファイル選択ハンドラー
   */
  const handleFileChange = useCallback((event) => {
    if (event.target.files && event.target.files.length > 0) {
      processFiles(Array.from(event.target.files));
    }
  }, [processFiles]);

  /**
   * ドラッグイベントハンドラー
   */
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  }, [processFiles]);

  /**
   * 画像を削除する関数
   * 
   * @param {number} index - 削除する画像のインデックス
   */
  const handleDeleteImage = useCallback((index) => {
    setImages(prevImages => {
      const newImages = [...prevImages];
      // オブジェクトURLを解放
      URL.revokeObjectURL(newImages[index].original);
      URL.revokeObjectURL(newImages[index].processed);
      
      // 処理済みファイルリストから削除
      const fileId = newImages[index].id;
      if (fileId) {
        setProcessingFiles(prev => {
          const newProcessingFiles = new Set(prev);
          newProcessingFiles.delete(fileId);
          return newProcessingFiles;
        });
      }
      
      // 配列から削除
      newImages.splice(index, 1);
      return newImages;
    });
  }, []);

  /**
   * 画像をダウンロードする関数
   * 
   * @param {Object} image - ダウンロードする画像オブジェクト
   */
  const handleDownload = useCallback(async (image) => {
    try {
      setDownloadProgress(0);
      if (downloadProgressRef.current) {
        downloadProgressRef.current.style.display = 'block';
      }

      const format = image.format || settings.defaultFormat;
      let fileName = `no_bg_${image.name.split('.')[0]}.${format}`;
      
      saveAs(image.blob, fileName);
      
      setDownloadHistory(prev => [...prev, { name: fileName, date: new Date().toLocaleString() }]);
      showNotification(`${fileName} のダウンロードが完了しました！`);

    } catch (error) {
      console.error('ダウンロード中にエラーが発生しました:', error);
      showNotification('ダウンロードに失敗しました。もう一度お試しください。', true);
    } finally {
      setDownloadProgress(100);
      setTimeout(() => {
        if (downloadProgressRef.current) {
          downloadProgressRef.current.style.display = 'none';
        }
        setDownloadProgress(0);
      }, 1000);
    }
  }, [settings.defaultFormat]);

  /**
   * フォーマットを変更する関数
   * 
   * @param {number} index - 変更する画像のインデックス
   * @param {string} format - 新しいフォーマット
   */
  const handleFormatChange = useCallback((index, format) => {
    setImages(prevImages => {
      const newImages = [...prevImages];
      newImages[index] = { ...newImages[index], format };
      return newImages;
    });
  }, []);

  /**
   * 設定を変更する関数
   * 
   * @param {string} setting - 変更する設定
   * @param {any} value - 新しい値
   */
  const handleSettingsChange = useCallback((setting, value) => {
    setSettings(prev => ({ ...prev, [setting]: value }));
  }, []);

  /**
   * 一括ダウンロードを処理する関数
   */
  const handleBatchDownload = useCallback(async () => {
    if (images.length === 0) return;

    try {
      if (settings.batchZip) {
        const zip = new JSZip();
        for (const image of images) {
          const format = image.format || settings.defaultFormat;
          const fileName = `no_bg_${image.name.split('.')[0]}.${format}`;
          zip.file(fileName, image.blob);
        }
        const content = await zip.generateAsync({type: "blob"});
        saveAs(content, "no_bg_images.zip");
      } else {
        for (const image of images) {
          await handleDownload(image);
        }
      }
      showNotification('すべての画像のダウンロードが完了しました！');
    } catch (error) {
      console.error('バッチダウンロード中にエラーが発生しました:', error);
      showNotification('ダウンロードに失敗しました。もう一度お試しください。', true);
    }
  }, [images, handleDownload, settings.batchZip, settings.defaultFormat]);

  /**
   * すべての画像を削除する関数
   */
  const handleClearAll = useCallback(() => {
    // すべてのオブジェクトURLを解放
    images.forEach(image => {
      URL.revokeObjectURL(image.original);
      URL.revokeObjectURL(image.processed);
    });
    
    // 処理済みファイルリストをクリア
    setProcessingFiles(new Set());
    
    // 画像リストをクリア
    setImages([]);
  }, [images]);

  /**
   * クリップボードから貼り付けを処理するエフェクト
   */
  useEffect(() => {
    const handlePaste = async (e) => {
      if (e.clipboardData.files.length > 0) {
        const files = e.clipboardData.files;
        processFiles(Array.from(files));
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [processFiles]);

  /**
   * コンポーネントのアンマウント時にリソースを解放
   */
  useEffect(() => {
    return () => {
      // すべてのオブジェクトURLを解放
      images.forEach(image => {
        URL.revokeObjectURL(image.original);
        URL.revokeObjectURL(image.processed);
      });
    };
  }, [images]);

  return (
    <div className={styles.container}>
      <Head>
        <title>背景削除メーカー</title>
        <meta name="description" content="画像の背景を削除するアプリケーション" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>背景削除メーカー</h1>

        <div
          className={`${styles.dropZone} ${isDragging ? styles.dragging : ''} ${loading ? styles.loading : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => !loading && fileInputRef.current && fileInputRef.current.click()}
        >
          <svg className={styles.uploadIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className={styles.uploadText}>
            {loading ? '処理中...' : 'ここに画像をドラッグ＆ドロップするか、'}
          </p>
          <input 
            type="file" 
            accept="image/*" 
            multiple 
            style={{ display: 'none' }} 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            onClick={(e) => { e.target.value = null; }}
            disabled={loading}
          />
          {!loading && (
            <button 
              className={styles.button} 
              onClick={(e) => {
                e.stopPropagation(); // イベントの伝播を停止
                fileInputRef.current && fileInputRef.current.click();
              }} 
              disabled={loading}
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              画像を選択
            </button>
          )}
          <div className={styles.progressBar}>
            <div className={styles.progress} style={{ width: `${progress}%` }}></div>
          </div>
          {loading && <p>処理中...（{Math.round(progress)}%）</p>}
          {error && <p className={styles.error}>{error}</p>}
        </div>

        <div className={styles.downloadProgress} ref={downloadProgressRef} style={{ display: 'none' }}>
          <div className={styles.downloadBar} style={{ width: `${downloadProgress}%` }}></div>
        </div>

        <div className={styles.settingsPanel}>
          <h3>設定</h3>
          <label>
            デフォルトフォーマット: 
            <select
              value={settings.defaultFormat}
              onChange={(e) => handleSettingsChange('defaultFormat', e.target.value)}
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
            </select>
          </label>
          <label>
            バッチダウンロード時にZIP化
            <input
              type="checkbox"
              checked={settings.batchZip}
              onChange={(e) => handleSettingsChange('batchZip', e.target.checked)}
            />
          </label>
        </div>

        {images.length > 0 && (
          <div className={styles.controlButtons}>
            <button
              className={styles.clearAllButton}
              onClick={handleClearAll}
            >
              すべての画像を削除
            </button>
            <button
              className={styles.batchDownload}
              onClick={handleBatchDownload}
            >
              {settings.batchZip ? "すべての画像をZIPでダウンロード" : "すべての画像をダウンロード"}
            </button>
          </div>
        )}

        <div className={styles.imageGrid}>
          {images.map((image, index) => (
            <div key={index} className={styles.imageCard}>
              <div className={styles.imageCardHeader}>
                <h2 className={styles.imageCardTitle}>{image.name}</h2>
                <button 
                  className={styles.deleteButton} 
                  onClick={() => handleDeleteImage(index)}
                  aria-label="削除"
                >
                  ×
                </button>
              </div>
              <div className={styles.imageComparison}>
                <div className={styles.imageWrapper}>
                  <h3 className={styles.imageLabel}>オリジナル</h3>
                  <img className={styles.image} src={image.original} alt={`オリジナル ${image.name}`} />
                </div>
                <div className={styles.imageWrapper}>
                  <h3 className={styles.imageLabel}>背景なし</h3>
                  <img className={styles.image} src={image.processed} alt={`背景なし ${image.name}`} />
                </div>
              </div>
              <div className={styles.formatSelectWrapper}>
                <select
                  className={styles.formatSelect}
                  value={image.format || settings.defaultFormat}
                  onChange={(e) => handleFormatChange(index, e.target.value)}
                >
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                  <option value="webp">WebP</option>
                </select>
              </div>
              <div className={styles.downloadButtonWrapper}>
                <button className={styles.button} onClick={() => handleDownload(image)}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  背景なし画像をダウンロード
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.downloadHistory}>
          <h3>ダウンロード履歴</h3>
          {downloadHistory.length === 0 ? (
            <p>まだダウンロードされた画像はありません。</p>
          ) : (
            downloadHistory.map((item, index) => (
              <div key={index} className={styles.historyItem}>
                {`${item.name} - ${item.date}`}
              </div>
            ))
          )}
        </div>
      </main>

      <footer className={styles.footer}>
        <p>背景削除メーカー &copy; {new Date().getFullYear()}</p>
      </footer>
      
      <div id="notification" className={styles.notification} style={{ display: 'none' }}></div>
    </div>
  );
} 