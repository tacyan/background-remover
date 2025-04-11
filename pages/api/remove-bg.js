/**
 * 背景削除APIハンドラー
 * 
 * このAPIはフロントエンドからのリクエストを受け取り、
 * 背景削除処理を行います。
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import busboy from 'busboy';
import { createReadStream, writeFileSync } from 'fs';
import { mkdir } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

// ボディパーサーを無効化
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Python環境をチェックし、必要なモジュールがインストールされているか確認
 * 
 * @returns {Promise<boolean>} チェック結果
 */
const checkPythonEnvironment = () => {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python', [
      '-c',
      'import sys; import pkg_resources; print(",".join([f"{pkg.key}=={pkg.version}" for pkg in pkg_resources.working_set if pkg.key in ["rembg", "pillow", "onnxruntime"]]))'
    ]);

    let output = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString().trim();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error('Pythonの実行中にエラーが発生しました'));
      }
      // モジュールのバージョン情報を返す
      resolve(output);
    });
  });
};

/**
 * 利用可能なonnxruntimeのバージョンを取得
 */
const getAvailableOnnxRuntimeVersion = () => {
  return new Promise((resolve, reject) => {
    const pipProcess = spawn('python', [
      '-m',
      'pip',
      'index',
      'versions',
      'onnxruntime'
    ]);

    let output = '';
    
    pipProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pipProcess.on('close', (code) => {
      try {
        // 出力から利用可能な最新バージョンを抽出
        const versionMatch = output.match(/Available versions: ([\d\., ]+)/);
        if (versionMatch && versionMatch[1]) {
          const versions = versionMatch[1].split(', ').filter(v => v.trim());
          const latestVersion = versions[versions.length - 1];
          console.log(`onnxruntimeの利用可能な最新バージョン: ${latestVersion}`);
          resolve(latestVersion);
        } else {
          // デフォルトバージョン
          resolve('1.17.0');
        }
      } catch (err) {
        console.error('バージョン情報の解析エラー:', err);
        resolve('1.17.0'); // エラー時はデフォルトバージョン
      }
    });
  });
};

/**
 * 必要なパッケージをインストール
 * 
 * @returns {Promise<void>}
 */
const installRequiredPackages = async () => {
  return new Promise(async (resolve, reject) => {
    console.log('必要なパッケージをインストールしています...');
    
    // 利用可能なonnxruntimeバージョンを取得
    let onnxVersion = '>=1.17.0';
    try {
      const availableVersion = await getAvailableOnnxRuntimeVersion();
      onnxVersion = availableVersion;
    } catch (err) {
      console.warn('onnxruntimeのバージョン取得に失敗しました。デフォルトを使用します。', err);
    }
    
    // requirements.txtのパスを指定（開発環境とデプロイ環境の両方に対応）
    const requirementsPath = fs.existsSync(path.join(process.cwd(), 'requirements.txt')) 
      ? path.join(process.cwd(), 'requirements.txt')
      : path.join(process.cwd(), '../requirements.txt');
      
    if (!fs.existsSync(requirementsPath)) {
      console.log('requirements.txtが見つかりません。直接インストールを試みます。');
      
      // 必要なパッケージをすべて明示的にインストール
      const pipProcess = spawn('python', [
        '-m',
        'pip',
        'install',
        'rembg==2.0.65',
        'pillow>=10.0.1,<12.0.0',
        `onnxruntime${onnxVersion}`,
        'numpy>=1.23.5',
        'scipy>=1.9.0',
        'pooch>=1.6.0'
      ]);
      
      let errorOutput = '';
      
      pipProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      pipProcess.stdout.on('data', (data) => {
        console.log(`pip出力: ${data.toString().trim()}`);
      });
      
      pipProcess.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`パッケージのインストールに失敗しました: ${errorOutput}`));
        }
        console.log('必要なパッケージのインストールが完了しました');
        resolve();
      });
      
      return;
    }
    
    // requirements.txtからインストール
    const pipProcess = spawn('python', [
      '-m',
      'pip',
      'install',
      '-r',
      requirementsPath
    ]);

    let errorOutput = '';
    
    pipProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    pipProcess.stdout.on('data', (data) => {
      console.log(`pip出力: ${data.toString().trim()}`);
    });

    pipProcess.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`パッケージのインストールに失敗しました: ${errorOutput}`));
      }
      console.log('必要なパッケージのインストールが完了しました');
      resolve();
    });
  });
};

/**
 * ファイルをパースする関数
 * 
 * @param {Object} req - リクエスト
 * @returns {Promise<{fields: Object, file: {data: Buffer, filename: string}}>} パース結果
 */
const parseForm = (req) => {
  return new Promise((resolve, reject) => {
    // リクエストが既に処理されているかチェック
    if (req.processed) {
      return reject(new Error('リクエストは既に処理されています'));
    }
    
    // リクエストを処理済みとしてマーク
    req.processed = true;
    
    const fields = {};
    let fileData = null;
    let fileName = '';
    
    const bb = busboy({ headers: req.headers });
    
    bb.on('file', (name, file, info) => {
      const { filename, encoding, mimeType } = info;
      const chunks = [];
      
      fileName = filename;
      
      file.on('data', (data) => {
        chunks.push(data);
      });
      
      file.on('end', () => {
        fileData = Buffer.concat(chunks);
      });
    });
    
    bb.on('field', (name, val) => {
      fields[name] = val;
    });
    
    bb.on('close', () => {
      resolve({
        fields,
        file: fileData ? { data: fileData, filename: fileName } : null
      });
    });
    
    bb.on('error', (err) => {
      reject(err);
    });
    
    req.pipe(bb);
  });
};

/**
 * バックグラウンドで背景削除処理を実行
 * 
 * @param {string} inputPath - 入力画像パス
 * @param {string} outputPath - 出力画像パス
 * @param {string} format - 出力フォーマット
 * @returns {Promise<void>}
 */
const removeBackground = async (inputPath, outputPath, format = 'png') => {
  return new Promise((resolve, reject) => {
    // Pythonスクリプトを実行
    const pythonProcess = spawn('python', [
      '-c',
      `
import sys
try:
    from PIL import Image
    from rembg import remove
    import io
    import onnxruntime
except ImportError as e:
    print(f"必要なモジュールがインストールされていません: {e}")
    print("pip install rembg==2.0.65 pillow>=10.0.1,<12.0.0 onnxruntime>=1.17.0 を実行してください")
    sys.exit(1)

try:
    print(f"onnxruntimeバージョン: {onnxruntime.__version__}")
    input_path = "${inputPath.replace(/\\/g, '\\\\')}"
    output_path = "${outputPath.replace(/\\/g, '\\\\')}"
    output_format = "${format}"

    print(f"処理を開始: {input_path} → {output_path}")
    
    # 画像を読み込み
    input_image = Image.open(input_path)
    
    # 背景削除処理
    output_image = remove(input_image)
    
    # 出力フォーマットの設定
    if output_format.lower() in ["jpeg", "jpg"]:
        # JPEGの場合は白背景を追加
        background = Image.new("RGBA", output_image.size, (255, 255, 255, 255))
        background.paste(output_image, mask=output_image.split()[3])
        background.convert("RGB").save(output_path, format="JPEG", quality=95)
    else:
        output_image.save(output_path, format=output_format.upper())
    
    print("処理成功")
except Exception as e:
    print(f"処理エラー: {str(e)}")
    sys.exit(1)
      `
    ]);

    let errorData = '';
    let outputData = '';

    pythonProcess.stdout.on('data', (data) => {
      const message = data.toString();
      console.log(`Python出力: ${message.trim()}`);
      outputData += message;
    });

    pythonProcess.stderr.on('data', (data) => {
      const message = data.toString();
      console.error(`Pythonエラー: ${message.trim()}`);
      errorData += message;
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python処理エラー: ${errorData || outputData}`));
      }
      resolve();
    });
  });
};

// リクエスト処理中かどうかを追跡するマップ
const processingRequests = new Map();
// リクエストの一意性を保証するためのマップ
const requestTimestamps = new Map();

export default async function handler(req, res) {
  // POSTメソッド以外は許可しない
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'メソッドが許可されていません' });
  }

  // リクエストの一意なIDを生成（ヘッダー情報から）
  const requestId = req.headers['x-request-id'] || 
                    `${req.headers['content-length']}-${req.headers['content-type']}-${Date.now()}`;
                    
  // 同じリクエストが処理中かチェック
  if (processingRequests.has(requestId)) {
    return res.status(429).json({ error: '処理中のリクエストがあります。しばらく待ってから再試行してください。' });
  }
  
  // リクエストを処理中としてマーク
  processingRequests.set(requestId, true);

  try {
    // 一時ディレクトリの作成
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true });
    }

    // Python環境をチェック
    try {
      const packageInfo = await checkPythonEnvironment();
      console.log(`インストール済みパッケージ: ${packageInfo}`);
      
      // 必要なパッケージがすべてインストールされているか確認
      const hasRembg = packageInfo.includes('rembg');
      const hasOnnx = packageInfo.includes('onnxruntime');
      
      if (!hasRembg || !hasOnnx) {
        console.log('必要なパッケージが不足しています。インストールを試みます。');
        await installRequiredPackages();
        
        // インストール後に再度チェック
        const updatedPackageInfo = await checkPythonEnvironment();
        console.log(`更新後のパッケージ: ${updatedPackageInfo}`);
      }
    } catch (envError) {
      console.warn('Python環境のチェックに失敗しました:', envError);
      try {
        // 環境チェックに失敗した場合でもインストールを試みる
        await installRequiredPackages();
      } catch (installError) {
        console.error('パッケージのインストールに失敗しました:', installError);
        // 続行を試みる
      }
    }

    // ファイルとフィールドをパース
    const { fields, file } = await parseForm(req);
    
    if (!file) {
      processingRequests.delete(requestId);
      return res.status(400).json({ error: 'ファイルがアップロードされていません' });
    }

    // 出力フォーマットの取得
    const outputFormat = fields.output_format || 'png';
    
    // 一時ファイルパスの設定
    const uid = uuidv4();
    const inputPath = path.join(tempDir, `input_${uid}`);
    const outputPath = path.join(tempDir, `output_${uid}.${outputFormat}`);
    
    // 入力ファイルを書き込み
    writeFileSync(inputPath, file.data);
    
    // 背景削除処理の実行
    await removeBackground(inputPath, outputPath, outputFormat);
    
    // 処理された画像を読み込み
    const outputBuffer = fs.readFileSync(outputPath);
    
    // 一時ファイルの削除
    try {
      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);
    } catch (err) {
      console.error('一時ファイルの削除に失敗しました:', err);
    }
    
    // MIMEタイプの設定
    let mimeType = `image/${outputFormat}`;
    if (outputFormat === 'jpg') {
      mimeType = 'image/jpeg';
    }
    
    // レスポンスヘッダーの設定
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="no_bg_image.${outputFormat}"`);
    
    // 処理が完了したのでリクエストをマップから削除
    processingRequests.delete(requestId);
    
    // 画像データを返す
    res.status(200).send(outputBuffer);
    
  } catch (error) {
    // エラー発生時もリクエストをマップから削除
    processingRequests.delete(requestId);
    
    console.error('API処理エラー:', error);
    res.status(500).json({ 
      error: `処理中にエラーが発生しました: ${error.message}`,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
} 