"""
背景削除APIモジュール

このモジュールはrembgライブラリを使用して画像の背景を削除するAPIエンドポイントを提供します。
アップロードされた画像を処理し、透明な背景の画像を返します。
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from rembg import remove
import io

app = FastAPI(title="背景削除API")

# CORSミドルウェアの設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本番環境では適切に制限すること
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/remove_bg")
async def remove_background(file: UploadFile = File(...), output_format: str = "png"):
    """
    画像の背景を削除するエンドポイント
    
    Args:
        file: アップロードされた画像ファイル
        output_format: 出力画像のフォーマット（デフォルト: png）
    
    Returns:
        背景が削除された画像
    
    Raises:
        HTTPException: 画像処理中にエラーが発生した場合
    """
    try:
        # アップロードされたファイルを読み込み
        contents = await file.read()
        input_image = Image.open(io.BytesIO(contents))
        
        # 背景削除処理
        output_image = remove(input_image)
        
        # 出力フォーマットの設定
        if output_format.lower() not in ["png", "jpeg", "jpg", "webp"]:
            output_format = "png"
            
        mime_type = f"image/{output_format.lower()}"
        if output_format.lower() == "jpg":
            mime_type = "image/jpeg"
            
        # 画像をバイト列に変換
        img_byte_arr = io.BytesIO()
        if output_format.lower() in ["jpeg", "jpg"]:
            # JPEGの場合は白背景を追加
            background = Image.new("RGBA", output_image.size, (255, 255, 255, 255))
            background.paste(output_image, mask=output_image.split()[3])
            background.convert("RGB").save(img_byte_arr, format="JPEG", quality=95)
        else:
            output_image.save(img_byte_arr, format=output_format.upper())
            
        img_byte_arr.seek(0)
        
        # 処理された画像を返す
        return Response(content=img_byte_arr.getvalue(), media_type=mime_type)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"画像処理エラー: {str(e)}")

# Vercel Serverless Functions用のハンドラー
def handler(request, context):
    return app(request, context) 